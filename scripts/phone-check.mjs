// Phone layout check: loads every page at iPhone width, reports anything wider
// than the screen (and which elements cause it), and saves screenshots.
// Uses a temporary admin account on the live site, removed at the end.
// Usage: node scripts/phone-check.mjs   (BASE defaults to the live site)
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => {
    const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
  }),
);
const BASE = process.env.BASE || "https://yoga-in-the-stars.vercel.app";
const OUT = "scripts/reports/phone";
fs.mkdirSync(OUT, { recursive: true });
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const email = `phonecheck-${stamp}@example.com`;
const PASSWORD = "phone-check-password-1";

const { data: u } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "Phone Check" } });
await db.from("profiles").update({ role: "admin", full_name: "Phone Check" }).eq("id", u.user.id);

const { data: someSession } = await db.from("class_sessions").select("id").gte("starts_at", new Date().toISOString()).order("starts_at").limit(1).single();
const { data: somePerson } = await db.from("profiles").select("id").eq("role", "yogi").not("momo_id", "is", null).limit(1).single();

const publicPages = ["/", "/schedule", `/classes/${someSession.id}`, "/membership", "/events", "/contact", "/privacy", "/login", "/register"];
const memberPages = ["/me"];
const adminPages = ["/admin", "/admin/people", `/admin/people/${somePerson.id}`, "/admin/insights", "/admin/schedule", "/admin/events", "/admin/plans", "/admin/broadcast", "/admin/settings", "/admin/health", "/teach"];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const results = [];

async function check(path) {
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const culprits = [];
    for (const el of document.querySelectorAll("body *")) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      // inside a deliberately scrolling box is fine
      let p = el.parentElement, scrolls = false;
      while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") { scrolls = true; break; } p = p.parentElement; }
      if (!scrolls && b.right > vw + 1) {
        const tag = el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 4).join(".") : "");
        culprits.push({ tag, right: Math.round(b.right), text: (el.textContent || "").trim().slice(0, 40) });
      }
    }
    // keep the outermost culprits only
    return { vw, scrollW: document.documentElement.scrollWidth, culprits: culprits.slice(0, 6) };
  });
  const name = path.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home";
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  const wide = r.scrollW > r.vw + 1 || r.culprits.length > 0;
  results.push({ path, wide, ...r });
  console.log(`${wide ? "WIDE" : "ok  "}  ${path}${wide ? `  (page ${r.scrollW}px on a ${r.vw}px screen)` : ""}`);
  for (const c of r.culprits) console.log(`        ${c.tag} -> ${c.right}px  "${c.text}"`);
}

try {
  for (const p of publicPages) await check(p);
  await page.goto(`${BASE}/login`);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click("button:has-text('Sign in')");
  await page.waitForURL(/\/me/, { timeout: 30_000 });
  for (const p of [...memberPages, ...adminPages]) await check(p);
} finally {
  await browser.close();
  await db.auth.admin.deleteUser(u.user.id);
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  console.log(`\n${results.filter((r) => r.wide).length} of ${results.length} pages wider than the screen. Screenshots in ${OUT}/`);
}
