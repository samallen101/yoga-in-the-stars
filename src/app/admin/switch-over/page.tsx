import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { fmtDate, gbp } from "@/lib/format";

export const metadata = { title: "Switch-over" };

type Row = {
  id: string; user_id: string; status: string; current_period_end: string | null; replaced_by: string | null;
  plan: { name: string; price_pence: number }; person: { full_name: string | null; email: string | null; phone: string | null };
};

// Monday of the week a date falls in, as YYYY-MM-DD.
function weekOf(iso: string) {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export default async function SwitchOverPage() {
  const db = createAdminClient();
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from("memberships")
      .select("id, user_id, status, current_period_end, replaced_by, membership_plans(name, price_pence), profiles(full_name, email, phone)")
      .eq("source", "momo")
      .in("status", ["active", "past_due", "paused"])
      .order("current_period_end")
      .range(from, from + 999);
    for (const m of data ?? []) rows.push({ ...m, plan: m.membership_plans as unknown as Row["plan"], person: m.profiles as unknown as Row["person"] } as Row);
    if (!data || data.length < 1000) break;
  }
  const now = Date.now();
  const current = rows.filter((r) => r.current_period_end && Date.parse(r.current_period_end) >= now - 86400_000);
  const paid = current.filter((r) => r.plan.price_pence > 0);
  const free = current.filter((r) => r.plan.price_pence <= 0);
  const moved = paid.filter((r) => r.replaced_by);
  const toMove = paid.filter((r) => !r.replaced_by);
  const monthly = toMove.reduce((n, r) => n + r.plan.price_pence, 0);

  const byPlan = new Map<string, { count: number; price: number }>();
  for (const r of toMove) byPlan.set(r.plan.name, { count: (byPlan.get(r.plan.name)?.count ?? 0) + 1, price: r.plan.price_pence });
  const freeByPlan = new Map<string, number>();
  for (const r of free) freeByPlan.set(r.plan.name, (freeByPlan.get(r.plan.name) ?? 0) + 1);

  const weeks = new Map<string, Row[]>();
  for (const r of toMove) {
    const w = weekOf(r.current_period_end!);
    weeks.set(w, [...(weeks.get(w) ?? []), r]);
  }

  return (
    <div>
      <PageHeader
        title="Switch-over"
        intro="Everyone on Momo who pays monthly, and when their next Momo renewal falls. On switch-over day Momo stops renewing; each person adds their card here before their date, so nobody pays twice and nobody has a gap."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-10">
        <div className="card">
          <div className="caps text-ink-soft">To move over</div>
          <div className="text-4xl font-serif mt-1">{toMove.length}</div>
          <div className="text-sm text-ink-soft mt-1">paying members, {gbp(monthly)} a month between them</div>
        </div>
        <div className="card">
          <div className="caps text-ink-soft">Already moved</div>
          <div className="text-4xl font-serif mt-1">{moved.length}</div>
          <div className="text-sm text-ink-soft mt-1">card set up on the new site</div>
        </div>
        <div className="card">
          <div className="caps text-ink-soft">Free memberships</div>
          <div className="text-4xl font-serif mt-1">{free.length}</div>
          <div className="text-sm text-ink-soft mt-1">no card needed; you renew these by hand when they&apos;re due</div>
        </div>
      </div>

      <section className="mb-10">
        <h2 className="text-xl font-serif mb-3">What they pay now</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-ink-soft"><tr><th className="py-1 pr-4">Plan on Momo</th><th className="py-1 pr-4">Price</th><th className="py-1">People</th></tr></thead>
            <tbody>
              {[...byPlan.entries()].sort((a, b) => b[1].count - a[1].count).map(([name, v]) => (
                <tr key={name} className="border-t border-line"><td className="py-2 pr-4">{name}</td><td className="py-2 pr-4">{gbp(v.price)}</td><td className="py-2">{v.count}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-ink-soft mt-3">Older plans (Founder, Couples, Pay as you wish) keep their price when they move, unless you decide otherwise.</p>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-serif mb-1">Renewals, week by week</h2>
        <p className="text-sm text-ink-soft mb-4">Each person gets one friendly reminder 14 days before their date (only after the go-live date is set). You can extend anyone by hand from their page if they need more time.</p>
        <div className="space-y-6">
          {[...weeks.entries()].map(([w, list]) => (
            <div key={w}>
              <h3 className="caps text-ink-soft mb-2">Week of {fmtDate(w, "d MMM")} · {list.length}</h3>
              <div className="card divide-y divide-line">
                {list.map((r) => (
                  <Link key={r.id} href={`/admin/people/${r.user_id}`} className="py-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm">
                    <span className="min-w-0 break-words">{r.person?.full_name ?? r.person?.email ?? "Unknown"} <span className="text-ink-soft">· {r.plan.name} · {gbp(r.plan.price_pence)}</span></span>
                    <span className="text-ink-soft whitespace-nowrap">{r.status === "past_due" ? "payment failed on Momo · " : ""}renews {fmtDate(r.current_period_end!, "EEE d MMM")}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
          {weeks.size === 0 && <p className="text-sm text-ink-soft">Nobody left to move.</p>}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-serif mb-3">Free memberships</h2>
        <div className="card text-sm">
          {[...freeByPlan.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => (
            <div key={name} className="flex justify-between gap-3 py-1"><span className="min-w-0 break-words">{name}</span><span className="text-ink-soft">{n}</span></div>
          ))}
          <p className="text-xs text-ink-soft mt-3">These carry on as they are. The dashboard shows who is due, and you extend them with one click.</p>
        </div>
      </section>
    </div>
  );
}
