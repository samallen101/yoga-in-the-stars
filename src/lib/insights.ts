import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { CATEGORIES, type Category, type Insights, type Monthly } from "@/lib/insights-types";
export { CATEGORIES, type Category, type Insights, type Monthly };

/**
 * Turns the Momo archive (every order since 2022, every person) into the
 * numbers and series Admin → Insights draws. Pure aggregation, no personal data
 * leaves the server except the top-spenders list, which is admin-only anyway.
 */

// Momo option names that are memberships (everything else with an expiry is a pass; drop-ins and
// "... on dd/mm/yyyy" session purchases are their own categories).
const MEMBERSHIP_NAMES = new Set([
  "Membership - Pay as you wish option ★ Low income", "Membership - Pay as you wish option ★★ Standard",
  "Membership - Pay as you wish ★ ★ ★ Community Supporter", "Yoga in the Stars ★ Membership ★",
  "Couples Special Offer Membership", "Couples Special Membership / £0 / partner", "FOUNDER MEMBER (3 month membership only)",
  "★ Pay as you wish Membership ★", "Special Offer 44!", "Yoga Teacher Membership Package", "Special Home Member", "★ GOLD STAR ★",
  "Natures Rhythm YTT Unlimited Pass", "Karma Yogi 3 - 4 months", "Integration Supplement Pass", "Basia Coaching Pass",
  "The Breath Retreat Gratis Pass", "Holotropic / Grof Breathwork Community Pass",
  "•••Psychedelic breathwork / Ecstatic Dance & Kundalini - INCLUDES 2 WEEK OF UNLIMITED YOGA!•••",
  "Thank you. One month gratis membership :)", "EQUINOX CELEBRATIONS - 7 Days Ticket", "Weekly Membership", "Test Membership £1",
  "Harmonia & Eris Weekend ticket (includes full week of unlimited Yoga in the Stars)", "2 week guest list friends and family",
  "1/2 Price £39.50", "3 Weeks Intensive & Unlimited with 1-1 consultation", "£33 / month / 3 months / UNLIMITED!",
  "Less than half price / Unlimited 1 month Membership", "Paradhis Pass 3 Months Free Pass - Yoga in the Stars",
  "Easter Weekend MULTI-DAY EVENT PASS (includes unlimited yoga sessions from now until 15th April)", "Star Staff Wellbeing - 3 months",
  "2 Week Trial Membership", "One Small Test - Try it now before you buy!", "Special Offer Membership",
]);

export function categorise(name: string): Category {
  if (MEMBERSHIP_NAMES.has(name)) return "Memberships";
  if (name === "Drop-in") return "Drop-ins";
  if (/ on \d{2}\/\d{2}\/\d{4}$/.test(name)) return "Sessions & events";
  if (/breathwork|retreat|holotropic|karma breather/i.test(name)) return "Breathwork & retreats";
  if (/pass/i.test(name)) return "Class passes";
  return "Other";
}

type OrderRow = [string | null, string, number | null, boolean | null, string | null, string | null, string | null, string | null, number | null, string];
type PersonRow = [string, string | null, string | null, string | null, boolean, string | null, string | null, string | null, string | null];

const ym = (iso: string) => iso.slice(0, 7);
function monthsBetween(a: string, b: string) {
  const out: string[] = []; let [y, m] = a.split("-").map(Number); const [ey, em] = b.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
const monthEnd = (k: string) => { const [y, m] = k.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const monthStart = (k: string) => k + "-01";
function addMonths(k: string, n: number) { let [y, m] = k.split("-").map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return `${y}-${String(m).padStart(2, "0")}`; }

export async function getInsights(): Promise<Insights> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("momo_insights_data");
  if (error) throw error;
  const raw = data as unknown as { orders: OrderRow[]; people: PersonRow[]; generated_at: string };
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = ym(today);

  const orders = raw.orders.map((r) => ({
    date: r[0], name: r[1], price: r[2] ?? 0, paid: !!r[3], method: r[4] || "unknown", promo: r[5], start: r[6], expiry: r[7], credits: r[8], who: r[9],
    cat: categorise(r[1]),
  }));
  const paid = orders.filter((o) => o.paid && o.date);
  const people = raw.people;

  // ---- monthly series
  const firstMonth = paid.reduce((m, o) => (o.date! < m ? o.date! : m), today).slice(0, 7);
  const months = monthsBetween(firstMonth, thisMonth);
  const firstPaidMonth = new Map<string, string>();
  for (const o of paid) { const k = ym(o.date!); const cur = firstPaidMonth.get(o.who); if (!cur || k < cur) firstPaidMonth.set(o.who, k); }
  const regByMonth = new Map<string, number>();
  for (const p of people) if (p[1]) regByMonth.set(ym(p[1]), (regByMonth.get(ym(p[1])) ?? 0) + 1);
  const memberships = paid.filter((o) => o.cat === "Memberships" && o.start && o.expiry);
  const monthly: Monthly[] = months.map((k) => {
    const inMonth = paid.filter((o) => ym(o.date!) === k);
    const revenue = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
    for (const o of inMonth) revenue[o.cat] += o.price;
    const payers = new Set(inMonth.map((o) => o.who));
    const ms = monthStart(k), me = monthEnd(k);
    const activeM = memberships.filter((o) => o.start! <= me && o.expiry! >= ms);
    const paidMembers = new Set(activeM.filter((o) => o.price > 0).map((o) => o.who)).size;
    const freeMembers = new Set(activeM.filter((o) => o.price === 0).map((o) => o.who)).size;
    return {
      month: k, revenue, revenueTotal: Object.values(revenue).reduce((a, b) => a + b, 0), orders: inMonth.length, payers: payers.size,
      newPayers: [...payers].filter((w) => firstPaidMonth.get(w) === k).length,
      failed: orders.filter((o) => !o.paid && o.date && ym(o.date) === k && o.price > 0).length,
      paidMembers, freeMembers, newRegistrations: regByMonth.get(k) ?? 0,
    };
  });

  // ---- totals
  const last12 = monthly.slice(-12), prev12 = monthly.slice(-24, -12);
  const sum = (arr: Monthly[]) => arr.reduce((a, m) => a + m.revenueTotal, 0);
  const sixtyAgo = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  const current = paid.filter((o) => o.expiry && o.expiry >= today);
  const totals = {
    people: people.length, withPhone: people.filter((p) => p[4]).length, active: people.filter((p) => p[2] === "Active").length,
    paidNow: new Set(current.filter((o) => o.cat === "Memberships" && o.price > 0).map((o) => o.who)).size,
    freeNow: new Set(current.filter((o) => o.cat === "Memberships" && o.price === 0).map((o) => o.who)).size,
    passesWithCredits: current.filter((o) => o.cat === "Class passes" && (o.credits ?? 0) > 0).length,
    revenue12m: sum(last12), revenuePrev12m: sum(prev12), avgMonthly12m: sum(last12) / Math.max(1, last12.length),
    failed60d: orders.filter((o) => !o.paid && o.price > 0 && o.date && o.date >= sixtyAgo).length,
    orders: orders.length, lifetimeRevenue: paid.reduce((a, o) => a + o.price, 0),
  };

  // ---- recency of last class
  const rec = { "Last 14 days": 0, "15 to 30 days": 0, "31 to 90 days": 0, "91 days to 1 year": 0, "Over a year": 0, "Never attended": 0 } as Record<string, number>;
  for (const p of people) {
    if (!p[3]) { rec["Never attended"]++; continue; }
    const days = (Date.parse(today) - Date.parse(p[3])) / 864e5;
    rec[days <= 14 ? "Last 14 days" : days <= 30 ? "15 to 30 days" : days <= 90 ? "31 to 90 days" : days <= 365 ? "91 days to 1 year" : "Over a year"]++;
  }
  const recency = Object.entries(rec).map(([bucket, people]) => ({ bucket, people }));

  // ---- options, methods, promos
  const byOpt = new Map<string, { revenue: number; orders: number }>();
  for (const o of paid) { const v = byOpt.get(o.name) ?? { revenue: 0, orders: 0 }; v.revenue += o.price; v.orders++; byOpt.set(o.name, v); }
  const topOptions = [...byOpt.entries()].map(([name, v]) => ({ name, category: categorise(name), revenue: v.revenue, orders: v.orders, avg: v.revenue / v.orders }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, 12);
  const byMethod = new Map<string, { orders: number; revenue: number }>();
  for (const o of paid) { const v = byMethod.get(o.method) ?? { orders: 0, revenue: 0 }; v.orders++; v.revenue += o.price; byMethod.set(o.method, v); }
  const paymentMethods = [...byMethod.entries()].map(([method, v]) => ({ method, ...v })).sort((a, b) => b.orders - a.orders);
  const byPromo = new Map<string, { uses: number; discount: number }>();
  for (const o of orders) if (o.promo) { const v = byPromo.get(o.promo) ?? { uses: 0, discount: 0 }; v.uses++; byPromo.set(o.promo, v); }
  const promoCodes = [...byPromo.entries()].map(([code, v]) => ({ code, ...v })).sort((a, b) => b.uses - a.uses).slice(0, 10);

  // ---- retention: cohort = month of first PAID membership; retained = holds a paid membership active in month+n
  const paidMem = memberships.filter((o) => o.price > 0);
  const firstMem = new Map<string, string>();
  for (const o of paidMem) { const k = ym(o.start!); const cur = firstMem.get(o.who); if (!cur || k < cur) firstMem.set(o.who, k); }
  const activeIn = (who: string, k: string) => paidMem.some((o) => o.who === who && o.start! <= monthEnd(k) && o.expiry! >= monthStart(k));
  const cohorts = new Map<string, string[]>();
  for (const [who, k] of firstMem) { if (!cohorts.has(k)) cohorts.set(k, []); cohorts.get(k)!.push(who); }
  const retention = [...cohorts.entries()].sort().map(([cohort, whos]) => {
    const pct = (n: number) => (addMonths(cohort, n) > thisMonth ? null : Math.round((100 * whos.filter((w) => activeIn(w, addMonths(cohort, n))).length) / whos.length));
    return { cohort, size: whos.length, m1: pct(1), m3: pct(3), m6: pct(6), m12: pct(12) };
  }).slice(-24);
  const retentionCurve = [1, 2, 3, 4, 5, 6, 9, 12].map((n) => {
    let num = 0, den = 0;
    for (const [cohort, whos] of cohorts) { if (addMonths(cohort, n) > thisMonth) continue; den += whos.length; num += whos.filter((w) => activeIn(w, addMonths(cohort, n))).length; }
    return { month: n, retained: den ? Math.round((100 * num) / den) : 0 };
  });

  // ---- lifetime value + top people
  const spend = new Map<string, { spend: number; orders: number }>();
  for (const o of paid) { const v = spend.get(o.who) ?? { spend: 0, orders: 0 }; v.spend += o.price; v.orders++; spend.set(o.who, v); }
  const ltvB = { "£0 (free only)": 0, "£1 to £50": 0, "£51 to £150": 0, "£151 to £400": 0, "£401 to £1,000": 0, "Over £1,000": 0 } as Record<string, number>;
  for (const v of spend.values()) ltvB[v.spend === 0 ? "£0 (free only)" : v.spend <= 50 ? "£1 to £50" : v.spend <= 150 ? "£51 to £150" : v.spend <= 400 ? "£151 to £400" : v.spend <= 1000 ? "£401 to £1,000" : "Over £1,000"]++;
  const ltv = Object.entries(ltvB).map(([bucket, people]) => ({ bucket, people }));
  const pmap = new Map(people.map((p) => [p[0], p]));
  const topPeople = [...spend.entries()].sort((a, b) => b[1].spend - a[1].spend).slice(0, 20).map(([id, v]) => {
    const p = pmap.get(id);
    return { id, name: p?.[8] || id, spend: v.spend, orders: v.orders, lastClass: p?.[3] ?? null, status: p?.[2] ?? null };
  });

  // ---- tenure of current paid members (months since first paid membership)
  const tenB = { "Under 3 months": 0, "3 to 6 months": 0, "6 to 12 months": 0, "1 to 2 years": 0, "Over 2 years": 0 } as Record<string, number>;
  for (const who of new Set(current.filter((o) => o.cat === "Memberships" && o.price > 0).map((o) => o.who))) {
    const f = firstMem.get(who); if (!f) continue;
    const m = (Number(thisMonth.slice(0, 4)) - Number(f.slice(0, 4))) * 12 + (Number(thisMonth.slice(5)) - Number(f.slice(5)));
    tenB[m < 3 ? "Under 3 months" : m < 6 ? "3 to 6 months" : m < 12 ? "6 to 12 months" : m < 24 ? "1 to 2 years" : "Over 2 years"]++;
  }
  const tenure = Object.entries(tenB).map(([bucket, members]) => ({ bucket, members }));

  // ---- where people are (outward postcode), ages
  const areaMap = new Map<string, number>();
  for (const p of people) { const pc = (p[6] || "").toUpperCase().replace(/\s+/g, ""); const m = pc.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)/); if (m) areaMap.set(m[1], (areaMap.get(m[1]) ?? 0) + 1); }
  const areas = [...areaMap.entries()].map(([area, people]) => ({ area, people })).sort((a, b) => b.people - a.people).slice(0, 12);
  const ageB = { "Under 25": 0, "25 to 34": 0, "35 to 44": 0, "45 to 54": 0, "55 to 64": 0, "65 and over": 0 } as Record<string, number>;
  for (const p of people) if (p[7]) { const a = (Date.parse(today) - Date.parse(p[7])) / (365.25 * 864e5); if (a < 10 || a > 100) continue; ageB[a < 25 ? "Under 25" : a < 35 ? "25 to 34" : a < 45 ? "35 to 44" : a < 55 ? "45 to 54" : a < 65 ? "55 to 64" : "65 and over"]++; }
  const ages = Object.entries(ageB).map(([bucket, people]) => ({ bucket, people }));

  // ---- weekday of purchases
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; const wd = new Array(7).fill(0);
  for (const o of paid) wd[(new Date(o.date!).getUTCDay() + 6) % 7]++;
  const weekday = days.map((day, i) => ({ day, orders: wd[i] }));

  return { generatedAt: raw.generated_at, totals, monthly, recency, topOptions, paymentMethods, promoCodes, retention, retentionCurve, ltv, topPeople, tenure, areas, ages, weekday };
}
