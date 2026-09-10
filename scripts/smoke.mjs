// End-to-end smoke test against a running dev server + live Supabase.
// Usage: node scripts/smoke.mjs   (reads .env.local)
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => {
    const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
  }),
);
const BASE = "http://localhost:3000";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const users = {
  admin: { email: `smoke-admin-${stamp}@example.com`, name: "Smoke Admin", role: "admin" },
  teacher: { email: `smoke-teacher-${stamp}@example.com`, name: "Smoke Teacher", role: "teacher" },
  yogi: { email: `smoke-yogi-${stamp}@example.com`, name: "Smoke Yogi", role: "yogi" },
  yogi2: { email: `smoke-yogi2-${stamp}@example.com`, name: "Second Yogi", role: "yogi" },
};
const PASSWORD = "smoke-test-password-1";
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " · " + detail : ""}`); };

async function main() {
  // --- users
  for (const u of Object.values(users)) {
    const { data, error } = await admin.auth.admin.createUser({ email: u.email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: u.name } });
    if (error) throw error;
    u.id = data.user.id;
    await admin.from("profiles").update({ role: u.role, full_name: u.name, whatsapp_opt_in: true, phone: "+447700900000" }).eq("id", u.id);
  }
  const { data: prof } = await admin.from("profiles").select("role").eq("id", users.admin.id).single();
  check("profile trigger + role update", prof?.role === "admin");

  // --- pick a session, assign teacher, make it tiny so we can test the waitlist
  const { data: sessions } = await admin.from("class_sessions").select("id, starts_at, class_types(name)").eq("pricing", "members_included").gte("starts_at", new Date().toISOString()).order("starts_at").limit(1);
  const session = sessions[0];
  await admin.from("class_sessions").update({ teacher_id: users.teacher.id, capacity: 1 }).eq("id", session.id);

  // --- grant yogi a class pass via the DB (what admin "Grant" does)
  const { data: passProduct } = await admin.from("class_pass_products").select("*").limit(1).single();
  await admin.from("class_passes").insert({ user_id: users.yogi.id, product_id: passProduct.id, credits_total: 5, credits_remaining: 5, expires_at: new Date(Date.now() + 30 * 86400_000).toISOString() });
  // yogi2 gets a granted membership
  const { data: plan } = await admin.from("membership_plans").select("*").limit(1).single();
  await admin.from("memberships").insert({ user_id: users.yogi2.id, plan_id: plan.id, status: "active", current_period_start: new Date().toISOString(), current_period_end: new Date(Date.now() + 30 * 86400_000).toISOString() });
  const { data: isMember } = await admin.rpc("is_active_member", { uid: users.yogi2.id });
  check("is_active_member() for granted membership", isMember === true);

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const login = async (u) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.fill("#email", u.email);
    await page.fill("#password", PASSWORD);
    await page.click("button:has-text('Sign in')");
    await page.waitForURL(/\/me/, { timeout: 20000 });
    return page;
  };

  // --- yogi books with class pass
  const yogi = await login(users.yogi);
  check("login redirects to /me", yogi.url().includes("/me"));
  await yogi.goto(`${BASE}/classes/${session.id}`);
  const label = await yogi.textContent("form .text-lg");
  check("entitlement shows class pass", /class pass/i.test(label ?? ""), label?.trim());
  await yogi.click("form button:has-text('Book')");
  await yogi.waitForURL(/msg=/);
  const msg1 = decodeURIComponent(yogi.url().split("msg=")[1] ?? "");
  check("class pass booking succeeds", msg1.startsWith("✓"), msg1);
  const { data: pass } = await admin.from("class_passes").select("credits_remaining").eq("user_id", users.yogi.id).single();
  check("credit deducted", pass.credits_remaining === 4, `remaining=${pass.credits_remaining}`);

  // --- member joins waitlist (capacity 1)
  const yogi2 = await login(users.yogi2);
  await yogi2.goto(`${BASE}/classes/${session.id}`);
  const label2 = await yogi2.textContent("form .text-lg");
  check("entitlement shows membership", /included/i.test(label2 ?? ""), label2?.trim());
  await yogi2.click("form button:has-text('waitlist')");
  await yogi2.waitForURL(/msg=/);
  const { data: b2 } = await admin.from("bookings").select("status").eq("user_id", users.yogi2.id).eq("session_id", session.id).single();
  check("full class puts member on waitlist", b2.status === "waitlisted", b2.status);

  // --- yogi cancels: credit returns, yogi2 promoted
  await yogi.goto(`${BASE}/classes/${session.id}`);
  await yogi.click("button:has-text('Cancel my booking')");
  await yogi.waitForURL(/msg=/);
  const { data: pass2 } = await admin.from("class_passes").select("credits_remaining").eq("user_id", users.yogi.id).single();
  check("credit returned on cancel", pass2.credits_remaining === 5, `remaining=${pass2.credits_remaining}`);
  const { data: b2b } = await admin.from("bookings").select("status").eq("user_id", users.yogi2.id).eq("session_id", session.id).single();
  check("waitlisted member promoted", b2b.status === "booked", b2b.status);

  // --- teacher sees register, checks in
  const teacher = await login(users.teacher);
  await teacher.goto(`${BASE}/teach`);
  check("teacher sees their class", (await teacher.textContent("body"))?.includes(session.class_types.name));
  await teacher.goto(`${BASE}/teach/${session.id}`);
  check("register lists the member", (await teacher.textContent("body"))?.includes("Second Yogi"));
  await teacher.click("button:has-text('Check in')");
  await teacher.waitForLoadState("networkidle");
  const { data: b2c } = await admin.from("bookings").select("status").eq("user_id", users.yogi2.id).eq("session_id", session.id).single();
  check("check-in marks attended", b2c.status === "attended", b2c.status);

  // --- admin dashboard + people + broadcast page render
  const adm = await login(users.admin);
  await adm.goto(`${BASE}/admin`);
  const dash = await adm.textContent("body");
  check("admin dashboard renders", dash?.includes("Active members"));
  await adm.goto(`${BASE}/admin/people?flag=members`);
  check("people list shows member", (await adm.textContent("body"))?.includes("Second Yogi"));
  await adm.goto(`${BASE}/admin/people/${users.yogi.id}`);
  check("person page renders", (await adm.textContent("body"))?.includes("Smoke Yogi"));
  for (const p of ["/admin/schedule", "/admin/plans", "/admin/events", "/admin/broadcast", "/admin/settings", "/membership", "/events", "/me"]) {
    const r = await adm.goto(`${BASE}${p}`);
    check(`GET ${p}`, r?.status() === 200, String(r?.status()));
  }

  // --- yogi cannot reach admin
  const r = await yogi.goto(`${BASE}/admin`);
  check("yogi blocked from /admin", yogi.url().endsWith("/me"), yogi.url());

  // --- teacher cancels the class
  await teacher.goto(`${BASE}/teach/${session.id}`);
  await teacher.fill("#reason", "Smoke test cancellation");
  await teacher.click("button:has-text('Cancel class and notify everyone')");
  await teacher.waitForURL(/msg=/);
  const { data: s } = await admin.from("class_sessions").select("status").eq("id", session.id).single();
  check("class cancelled", s.status === "cancelled");

  // --- outbox + crons
  const { data: events } = await admin.from("outbox_events").select("type").in("user_id", Object.values(users).map((u) => u.id)).order("created_at");
  const types = events.map((e) => e.type);
  check("outbox has the expected events", ["booking.created", "booking.waitlisted", "booking.cancelled", "booking.promoted", "session.cancelled"].every((t) => types.includes(t)), types.join(", "));
  const cron = await fetch(`${BASE}/api/cron/outbox`, { headers: { authorization: `Bearer ${env.CRON_SECRET}` } }).then((r) => r.json());
  check("outbox cron runs (emails logged, no n8n yet)", typeof cron.emails?.sent === "number", JSON.stringify(cron));
  const daily = await fetch(`${BASE}/api/cron/daily`, { headers: { authorization: `Bearer ${env.CRON_SECRET}` } }).then((r) => r.json());
  check("daily cron runs", "reminders" in daily, JSON.stringify(daily));
  const unauth = await fetch(`${BASE}/api/cron/daily`);
  check("cron rejects missing secret", unauth.status === 401);

  await browser.close();

  // --- cleanup
  await admin.from("class_sessions").update({ status: "scheduled", cancel_reason: null, capacity: 16, teacher_id: null }).eq("id", session.id);
  for (const u of Object.values(users)) await admin.auth.admin.deleteUser(u.id);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
