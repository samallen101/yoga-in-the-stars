// Automated run of launch test script sections 2 (paying), 3 (refunds and
// renewals) and 4 (booking rules) against the LIVE site in Stripe TEST mode.
// Runs against production because Stripe's sandbox webhook points there.
// Everything it creates (users, class type, sessions, event, orders, Stripe
// test customers) is named E2E and removed at the end unless KEEP=1.
// Usage: node scripts/e2e-payments.mjs   (reads .env.local; needs sandbox keys)
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { chromium } from "playwright";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => {
    const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
  }),
);
if (!env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) throw new Error("Refusing to run: STRIPE_SECRET_KEY is not a test key.");
const BASE = process.env.BASE || "https://yoga-in-the-stars.vercel.app";
const KEEP = process.env.KEEP === "1";
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stripe = new Stripe(env.STRIPE_SECRET_KEY);
const stamp = Date.now();
const PASSWORD = "e2e-test-password-1";
const DAY = 86400_000;

const results = [];
const check = (section, name, ok, detail = "") => {
  results.push({ section, name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  [${section}] ${name}${detail ? " · " + detail : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 60_000, every = 2_000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { last = await fn(); if (last) return last; await sleep(every); }
  return last;
}

const created = { users: [], sessions: [], classType: null, event: null, customers: [] };
const mkUser = async (key, name) => {
  const email = `e2e-${key}-${stamp}@example.com`;
  const { data, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  await db.from("profiles").update({ full_name: name }).eq("id", data.user.id);
  created.users.push(data.user.id);
  return { id: data.user.id, email, name };
};

let browser;

let currentPage = null;
let stepNo = 0;
async function step(fn) {
  stepNo++;
  try { await fn(); }
  catch (e) {
    const shot = `scripts/reports/e2e-${stamp}-step${stepNo}.png`;
    try { fs.mkdirSync("scripts/reports", { recursive: true }); await currentPage?.screenshot({ path: shot, fullPage: true }); } catch {}
    check("!", `step ${stepNo} stopped`, false, `${String(e.message).split("\n")[0]} · at ${currentPage?.url() ?? "?"} · ${shot}`);
    try { await currentPage?.context().close(); } catch {}
  }
}
async function login(u) {
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", locale: "en-GB", viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  currentPage = page;
  await page.goto(`${BASE}/login`);
  await page.fill("#email", u.email);
  await page.fill("#password", PASSWORD);
  await page.click("button:has-text('Sign in')");
  await page.waitForURL(/\/me/, { timeout: 30_000 });
  return page;
}

/** Fill Stripe's hosted checkout. Returns true if we were sent back to the site. */
async function payOnStripe(page, card, { expectBack = true } = {}) {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 45_000, waitUntil: "commit" });
  // Stripe's page occasionally stalls on its loading skeleton for automated browsers: reload once.
  const ready = page.locator("#cardNumber, [data-testid=\"card-accordion-item-button\"]").first();
  try { await ready.waitFor({ timeout: 30_000 }); }
  catch { await page.reload({ waitUntil: "commit" }); await ready.waitFor({ timeout: 45_000 }); }
  await page.waitForLoadState("domcontentloaded");
  const accordion = page.locator('[data-testid="card-accordion-item-button"]');
  if (await accordion.count()) await accordion.first().click().catch(() => {});
  await page.fill("#cardNumber", card);
  await page.fill("#cardExpiry", "12 / 34");
  await page.fill("#cardCvc", "123");
  if (await page.locator("#billingName").count()) await page.fill("#billingName", "E2E Tester");
  if (await page.locator("#billingCountry").count()) await page.selectOption("#billingCountry", "GB").catch(() => {});
  if (await page.locator("#billingPostalCode").count()) await page.fill("#billingPostalCode", "E11 4AA").catch(() => {});
  await page.click(".SubmitButton");
  if (!expectBack) return false;
  await page.waitForURL((u) => u.toString().startsWith(BASE), { timeout: 60_000, waitUntil: "commit" });
  return true;
}

async function main() {
  // ---------- setup
  const [dropper, pwyw, passer, member, ticketer, decliner, refunder, renewer, rules1, rules2] = await Promise.all([
    mkUser("dropin", "E2E Drop In"), mkUser("pwyw", "E2E Pay As You Wish"), mkUser("pass", "E2E Class Pass"),
    mkUser("member", "E2E Member"), mkUser("ticket", "E2E Ticket"), mkUser("declined", "E2E Declined"),
    mkUser("refund", "E2E Refund"), mkUser("renewal", "E2E Renewal"), mkUser("rules1", "E2E Rules One"), mkUser("rules2", "E2E Rules Two"),
  ]);
  const { data: ct } = await db.from("class_types").insert({ name: `E2E Test Class ${stamp}`, active: false, default_capacity: 10 }).select("id").single();
  created.classType = ct.id;
  const at = (days, hours = 18) => { const d = new Date(Date.now() + days * DAY); d.setUTCHours(hours, 0, 0, 0); return d; };
  const session = async (days, pricing, extra = {}) => {
    const s = at(days);
    const { data, error } = await db.from("class_sessions").insert({
      class_type_id: ct.id, starts_at: s.toISOString(), ends_at: new Date(s.getTime() + 3600_000).toISOString(),
      capacity: 10, pricing, drop_in_pence: 1300, suggested_pwyw_pence: 1000, ...extra,
    }).select("id").single();
    if (error) throw error;
    created.sessions.push(data.id);
    return data.id;
  };
  const sDrop = await session(60, "drop_in");
  const sDrop2 = await session(61, "drop_in");
  const sPwyw = await session(62, "pay_what_you_wish");
  const sMembers = await session(63, "members_included");
  const sMembers2 = await session(64, "members_included");
  const sLastSpot = await session(65, "members_included", { capacity: 1 });
  const { data: settings } = await db.from("settings").select("*").eq("id", 1).single();
  const cutoffMin = Number(settings?.booking_cutoff_minutes ?? 0);

  const { data: ev } = await db.from("events").insert({ title: `E2E Test Event ${stamp}`, slug: `e2e-${stamp}`, starts_at: at(66).toISOString(), status: "published" }).select("id, slug").single();
  created.event = ev.id;
  const { data: ticket } = await db.from("event_tickets").insert({ event_id: ev.id, name: "E2E ticket", price_pence: 1500 }).select("id").single();

  const { data: plans } = await db.from("membership_plans").select("*").eq("active", true);
  const standard = plans.find((p) => /standard/i.test(p.name)) ?? plans[0];
  const { data: passProducts } = await db.from("class_pass_products").select("*");
  const threePass = passProducts.find((p) => p.credits === 3) ?? passProducts[0];

  browser = await chromium.launch();

  // ---------- 2. Paying, all four kinds
  await step(async () => {
    const p = await login(dropper);
    await p.goto(`${BASE}/classes/${sDrop}`);
    await p.click("form button:has-text('Pay')");
    await payOnStripe(p, "4242424242424242");
    const order = await waitFor(async () => (await db.from("orders").select("*").eq("user_id", dropper.id).eq("session_id", sDrop).eq("status", "paid").maybeSingle()).data);
    check("2", "drop-in order marked paid", order, order ? `£${order.amount_pence / 100}` : "no paid order within 60s");
    const { data: b } = await db.from("bookings").select("status").eq("user_id", dropper.id).eq("session_id", sDrop).maybeSingle();
    check("2", "drop-in booking created", b?.status === "booked", b?.status);
    if (order?.stripe_payment_intent_id) {
      const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);
      const cs = order.stripe_checkout_session_id ? await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id) : null;
      check("2", "order id on the Stripe checkout session", cs?.metadata?.order_id === order.id);
      check("2", "order id on the Stripe payment itself (what the dashboard shows)", pi.metadata?.order_id === order.id, pi.metadata?.order_id ? "" : "payment intent has no order_id metadata");
    }
    await p.context().close();
  });
  await step(async () => {
    const p = await login(pwyw);
    await p.goto(`${BASE}/classes/${sPwyw}`);
    await p.fill("#amount", "7");
    await p.click("form button:has-text('Book')");
    await payOnStripe(p, "4242424242424242");
    const order = await waitFor(async () => (await db.from("orders").select("*").eq("user_id", pwyw.id).eq("status", "paid").maybeSingle()).data);
    let charged = null;
    if (order?.stripe_payment_intent_id) charged = (await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id)).amount_received;
    check("2", "pay what you wish charges exactly what was typed", charged === 700, `charged ${charged}p for £7`);
    await p.context().close();
  });
  await step(async () => {
    const p = await login(passer);
    await p.goto(`${BASE}/membership`);
    await p.locator("form", { hasText: threePass.name }).locator("button").first().click();
    await payOnStripe(p, "4242424242424242");
    const pass = await waitFor(async () => (await db.from("class_passes").select("*").eq("user_id", passer.id).maybeSingle()).data);
    check("2", "class pass created with its credits", pass?.credits_remaining === threePass.credits, pass ? `${pass.credits_remaining} credits, expires ${pass.expires_at?.slice(0, 10)}` : "no pass within 60s");
    await p.goto(`${BASE}/classes/${sMembers}`);
    await p.click("form button:has-text('Book')");
    await p.waitForURL(/msg=/);
    const { data: after } = await db.from("class_passes").select("credits_remaining").eq("user_id", passer.id).single();
    check("2", "booking with the pass takes one credit", after.credits_remaining === threePass.credits - 1, `${after.credits_remaining} left`);
    await p.context().close();
  });
  await step(async () => {
    const p = await login(member);
    await p.goto(`${BASE}/membership`);
    await p.locator("form", { hasText: standard.name }).locator("button").first().click();
    await payOnStripe(p, "4242424242424242");
    const m = await waitFor(async () => (await db.from("memberships").select("*").eq("user_id", member.id).eq("status", "active").maybeSingle()).data);
    check("2", `${standard.name} membership active`, m, m ? `renews ${m.current_period_end?.slice(0, 10)}` : "none within 60s");
    if (m?.stripe_subscription_id) {
      const sub = await stripe.subscriptions.retrieve(m.stripe_subscription_id);
      const end = sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end;
      check("2", "renewal date matches Stripe", Math.abs(Date.parse(m.current_period_end) / 1000 - end) < 120);
      created.customers.push(sub.customer);
    }
    await p.goto(`${BASE}/classes/${sMembers}`);
    await p.click("form button:has-text('Book')");
    await p.waitForURL(/msg=/);
    const { data: b } = await db.from("bookings").select("paid_with, amount_pence").eq("user_id", member.id).eq("session_id", sMembers).maybeSingle();
    check("2", "member books with no charge", b?.paid_with === "membership" && b?.amount_pence === 0, JSON.stringify(b));
    await p.context().close();
  });
  await step(async () => {
    const p = await login(ticketer);
    await p.goto(`${BASE}/events/${ev.slug}`);
    await p.locator("form", { hasText: "E2E ticket" }).locator("button").first().click();
    await payOnStripe(p, "4242424242424242");
    const order = await waitFor(async () => (await db.from("orders").select("*").eq("user_id", ticketer.id).eq("event_id", ev.id).eq("status", "paid").maybeSingle()).data);
    check("2", "event ticket paid and recorded", order, order ? `£${order.amount_pence / 100}` : "none within 60s");
    await p.goto(`${BASE}/me`);
    check("2", "ticket shows on the buyer's page", (await p.textContent("body"))?.includes("E2E Test Event"));
    await p.context().close();
  });
  await step(async () => {
    const p = await login(decliner);
    await p.goto(`${BASE}/classes/${sDrop2}`);
    await p.click("form button:has-text('Pay')");
    await payOnStripe(p, "4000000000000002", { expectBack: false });
    await sleep(6000);
    check("2", "declined card: Stripe shows the failure and stays on its page", p.url().includes("checkout.stripe.com"));
    const { data: orders } = await db.from("orders").select("status").eq("user_id", decliner.id);
    const { data: b } = await db.from("bookings").select("id").eq("user_id", decliner.id).eq("session_id", sDrop2);
    check("2", "declined card: nothing marked paid, no booking", !orders?.some((o) => o.status === "paid") && !(b?.length));
    // abandon and retry
    await p.goto(`${BASE}/classes/${sDrop2}`);
    await p.click("form button:has-text('Pay')");
    await p.waitForURL(/checkout\.stripe\.com/, { timeout: 45_000, waitUntil: "commit" });
    check("2", "abandoned checkout doesn't block a retry", true);
    await payOnStripe(p, "4242424242424242");
    const paid = await waitFor(async () => (await db.from("orders").select("id").eq("user_id", decliner.id).eq("status", "paid").maybeSingle()).data);
    check("2", "retry after a decline succeeds", paid);
    await p.context().close();
  });

  // ---------- 3. Refunds, cancellations and failed renewals
  await step(async () => {
    const { data: o } = await db.from("orders").select("*").eq("user_id", dropper.id).eq("status", "paid").single();
    await stripe.refunds.create({ payment_intent: o.stripe_payment_intent_id });
    const refunded = await waitFor(async () => (await db.from("orders").select("status").eq("id", o.id).single()).data?.status === "refunded");
    check("3", "refunding a drop-in in Stripe marks the order refunded", refunded);
    const { data: b } = await db.from("bookings").select("status").eq("user_id", dropper.id).eq("session_id", sDrop).single();
    check("3", "refunded drop-in's booking is cancelled", b.status === "cancelled", b.status);
  });
  await step(async () => {
    const { data: o } = await db.from("orders").select("*").eq("user_id", passer.id).eq("status", "paid").single();
    await stripe.refunds.create({ payment_intent: o.stripe_payment_intent_id });
    await waitFor(async () => (await db.from("orders").select("status").eq("id", o.id).single()).data?.status === "refunded");
    const { data: pass } = await db.from("class_passes").select("credits_remaining, expires_at").eq("user_id", passer.id).single();
    check("3", "refunded class pass is voided", pass.credits_remaining === 0 || Date.parse(pass.expires_at) <= Date.now(), JSON.stringify(pass));
  });
  await step(async () => {
    const { data: m } = await db.from("memberships").select("*").eq("user_id", member.id).single();
    await stripe.subscriptions.update(m.stripe_subscription_id, { cancel_at_period_end: true });
    await sleep(8000);
    const { data: still } = await db.from("memberships").select("status").eq("id", m.id).single();
    check("3", "cancel at period end: still active until the end date", still.status === "active", still.status);
    await stripe.subscriptions.cancel(m.stripe_subscription_id);
    const ended = await waitFor(async () => (await db.from("memberships").select("status").eq("id", m.id).single()).data?.status === "cancelled");
    check("3", "subscription ended in Stripe turns the membership off", ended);
  });
  await step(async () => {
    // Failed renewal: buy normally, then switch to a card that fails and bill now.
    const p = await login(renewer);
    await p.goto(`${BASE}/membership`);
    await p.locator("form", { hasText: standard.name }).locator("button").first().click();
    await payOnStripe(p, "4242424242424242");
    await p.context().close();
    const m = await waitFor(async () => (await db.from("memberships").select("*").eq("user_id", renewer.id).eq("status", "active").maybeSingle()).data);
    if (m?.stripe_subscription_id) {
      const sub = await stripe.subscriptions.retrieve(m.stripe_subscription_id);
      created.customers.push(sub.customer);
      const failing = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", { customer: sub.customer });
      await stripe.subscriptions.update(sub.id, { default_payment_method: failing.id });
      await stripe.subscriptions.update(sub.id, { billing_cycle_anchor: "now", proration_behavior: "none" }).catch((e) => console.log("anchor update:", e.message));
      const after = await stripe.subscriptions.retrieve(sub.id, { expand: ["latest_invoice"] });
      console.log("stripe after forcing renewal:", after.status, "invoice", after.latest_invoice?.status, after.latest_invoice?.amount_due);
      const pastDue = await waitFor(async () => (await db.from("memberships").select("status").eq("id", m.id).single()).data?.status === "past_due", 90_000);
      check("3", "failed renewal puts the membership past due", pastDue);
      const { data: ev1 } = await db.from("outbox_events").select("type").eq("user_id", renewer.id).ilike("type", "%fail%");
      check("3", "failed renewal tells the team (outbox event)", ev1?.length, ev1?.map((e) => e.type).join(", "));
      const good = await stripe.paymentMethods.attach("pm_card_visa", { customer: sub.customer });
      await stripe.subscriptions.update(sub.id, { default_payment_method: good.id });
      const latest = (await stripe.subscriptions.retrieve(sub.id)).latest_invoice;
      await stripe.invoices.pay(typeof latest === "string" ? latest : latest.id, { payment_method: good.id }).catch((e) => console.log("invoice pay:", e.message));
      const back = await waitFor(async () => (await db.from("memberships").select("status").eq("id", m.id).single()).data?.status === "active", 90_000);
      check("3", "new card and a successful payment bring it back to active", back);
    } else check("3", "failed renewal setup", false, "membership did not start");
  });

  // ---------- 4. Booking rules (the ones the smoke test doesn't cover)
  await step(async () => {
    const { data: rp } = await db.from("class_passes").insert({ user_id: rules1.id, product_id: threePass.id, credits_total: 3, credits_remaining: 3, expires_at: new Date(Date.now() + 90 * DAY).toISOString() }).select("id").single();
    await db.from("class_passes").insert({ user_id: rules2.id, product_id: threePass.id, credits_total: 3, credits_remaining: 3, expires_at: new Date(Date.now() + 90 * DAY).toISOString() });
    const a = await login(rules1);
    await a.goto(`${BASE}/classes/${sMembers2}`);
    await a.click("form button:has-text('Book')");
    await a.waitForURL(/msg=/);
    await a.goto(`${BASE}/classes/${sMembers2}`);
    const bookBtn = await a.getByRole("button", { name: /^(Book this class|Join the waitlist)$/ }).count();
    const { data: dup } = await db.from("bookings").select("id").eq("user_id", rules1.id).eq("session_id", sMembers2);
    check("4", "can't book the same class twice", !bookBtn && dup.length === 1);

    const b = await login(rules2);
    await Promise.all([a.goto(`${BASE}/classes/${sLastSpot}`), b.goto(`${BASE}/classes/${sLastSpot}`)]);
    await Promise.all([a.click("form button:has-text('Book')"), b.click("form button:has-text('Book')")]);
    await Promise.all([a.waitForURL(/msg=/).catch(() => {}), b.waitForURL(/msg=/).catch(() => {})]);
    const { data: last } = await db.from("bookings").select("status").eq("session_id", sLastSpot);
    const booked = last.filter((x) => x.status === "booked").length;
    check("4", "two people, last spot, same moment: exactly one gets it", booked === 1, last.map((x) => x.status).join(", "));

    await db.from("class_passes").update({ expires_at: new Date(Date.now() - DAY).toISOString() }).eq("id", rp.id);
    await a.goto(`${BASE}/classes/${sDrop2}`);
    const label = (await a.textContent("body")) ?? "";
    check("4", "expired pass isn't offered; drop-in price shown instead", !/class pass/i.test((await a.locator("form .text-lg").textContent().catch(() => "")) ?? "") && /£13/.test(label));

    if (cutoffMin > 0) {
      const soon = new Date(Date.now() + Math.max(1, cutoffMin - 5) * 60_000);
      const { data: sSoon } = await db.from("class_sessions").insert({ class_type_id: ct.id, starts_at: soon.toISOString(), ends_at: new Date(soon.getTime() + 3600_000).toISOString(), pricing: "members_included", capacity: 10 }).select("id").single();
      created.sessions.push(sSoon.id);
      await db.from("class_passes").update({ expires_at: new Date(Date.now() + 90 * DAY).toISOString() }).eq("id", rp.id);
      await a.goto(`${BASE}/classes/${sSoon.id}`);
      const canBook = await a.locator("form button:has-text('Book')").count();
      const { data: bSoon } = await db.from("bookings").select("id").eq("session_id", sSoon.id);
      check("4", `booking inside the ${cutoffMin}-minute cutoff is refused`, !canBook && !bSoon.length);
    } else check("4", "booking cutoff", true, "cutoff is 0 minutes in settings, nothing to test");
  });
}

async function cleanup() {
  if (KEEP) { console.log("KEEP=1: test data left in place."); return; }
  const ids = created.users;
  for (const c of created.customers) {
    const subs = await stripe.subscriptions.list({ customer: c, status: "all" }).catch(() => ({ data: [] }));
    for (const s of subs.data) if (s.status !== "canceled") await stripe.subscriptions.cancel(s.id).catch(() => {});
  }
  if (ids.length) {
    const { data: profs } = await db.from("profiles").select("stripe_customer_id").in("id", ids);
    for (const p of profs ?? []) if (p.stripe_customer_id) await stripe.customers.del(p.stripe_customer_id).catch(() => {});
    await db.from("bookings").delete().in("user_id", ids);
    await db.from("orders").delete().in("user_id", ids);
    await db.from("memberships").delete().in("user_id", ids);
    await db.from("class_passes").delete().in("user_id", ids);
    await db.from("outbox_events").delete().in("user_id", ids);
  }
  if (created.event) { await db.from("orders").delete().eq("event_id", created.event); await db.from("events").delete().eq("id", created.event); }
  if (created.sessions.length) { await db.from("bookings").delete().in("session_id", created.sessions); await db.from("class_sessions").delete().in("id", created.sessions); }
  if (created.classType) await db.from("class_types").delete().eq("id", created.classType);
  for (const id of ids) await db.auth.admin.deleteUser(id).catch((e) => console.log("delete user", id, e.message));
  console.log("Cleaned up test data.");
}

let crashed = null;
try { await main(); } catch (e) { crashed = e; console.error("CRASHED:", e.message); }
finally {
  await browser?.close().catch(() => {});
  await cleanup().catch((e) => console.error("cleanup failed:", e.message));
  const passed = results.filter((r) => r.ok).length;
  const report = [`# E2E payments run ${new Date().toISOString()}`, "", `${passed}/${results.length} passed${crashed ? ` (stopped early: ${crashed.message})` : ""}`, "",
    ...results.map((r) => `- ${r.ok ? "PASS" : "FAIL"} [${r.section}] ${r.name}${r.detail ? ` · ${r.detail}` : ""}`)].join("\n");
  fs.mkdirSync("scripts/reports", { recursive: true });
  fs.writeFileSync(`scripts/reports/e2e-${stamp}.md`, report + "\n");
  console.log(`\n${passed}/${results.length} passed. Report: scripts/reports/e2e-${stamp}.md`);
  process.exit(crashed || passed !== results.length ? 1 : 0);
}
