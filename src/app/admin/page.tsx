import Link from "next/link";
import { getDashboard } from "@/lib/admin";
import { fmtDate, fmtDateTime, gbp } from "@/lib/format";
import { PageHeader, Stat, FlagPill } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata = { title: "Admin" };

export default async function AdminDashboard() {
  const d = await getDashboard();
  // Memberships that came over from Momo and have nothing renewing them.
  const { data: legacyRows } = await createAdminClient()
    .from("memberships")
    .select("id, user_id, current_period_end, transfer_nudged_at, membership_plans(name, price_pence), profiles(full_name)")
    .eq("source", "momo").eq("status", "active").is("stripe_subscription_id", null).is("replaced_by", null)
    .lte("current_period_end", new Date(Date.now() + 30 * 86400_000).toISOString())
    .order("current_period_end").limit(60);
  const legacy = (legacyRows ?? []).map((m) => ({ ...m, plan: m.membership_plans as unknown as { name: string; price_pence: number }, person: m.profiles as unknown as { full_name: string | null } }));
  const legacyPaid = legacy.filter((m) => m.plan.price_pence > 0);
  const legacyFree = legacy.filter((m) => m.plan.price_pence <= 0);
  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" intro="The numbers Momo never gave you." />
      {!d.membersLive && (
        <p className="text-sm text-ink-soft -mt-2 mb-6 max-w-3xl">
          Until switch-over, classes are booked on Momo, so attendance and renewals here come from the latest Momo import. Nudges only count paying members.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Paying members" value={d.memberCount} hint={`plus ${d.freeMemberCount} free (teachers, home members, partners) · ${d.joinedThisMonth} joined · ${d.cancelledThisMonth} left this month`} />
        <Stat label="Paying members to nudge" value={d.flags.orange + d.flags.red} hint={`${d.flags.orange} orange · ${d.flags.red} red`} tone={d.flags.red > 0 ? "red" : d.flags.orange > 0 ? "orange" : "green"} />
        <Stat label="Attendances (30 days)" value={d.attendance30} hint="Booked or checked in" />
        <Stat label="Taken (30 days)" value={gbp(d.revenue30)} hint="Via Stripe, all products" />
      </div>

      {legacy.length > 0 && (
        <section className="card">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="font-semibold text-brand">Momo memberships ending in the next 30 days</h2>
            <span className="text-sm text-ink-soft">{legacyPaid.length} paid · {legacyFree.length} free</span>
          </div>
          <p className="text-sm text-ink-soft mt-1">
            These came over from Momo and nothing renews them here. Paid ones get an email 14 days before the end asking them to set up a card on the site (their paid time is honoured, nothing is charged early). Free ones (teachers, home members, partners) are yours to extend from their page.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-ink-soft"><tr><th className="py-1 pr-3">Person</th><th className="py-1 pr-3">Plan</th><th className="py-1 pr-3">Ends</th><th className="py-1 pr-3">Nudged</th></tr></thead>
              <tbody>
                {legacy.map((m) => (
                  <tr key={m.id} className="border-t border-ink/10">
                    <td className="py-1.5 pr-3"><Link href={`/admin/people/${m.user_id}`} className="underline">{m.person?.full_name ?? "Unnamed"}</Link></td>
                    <td className="py-1.5 pr-3">{m.plan.name}{m.plan.price_pence > 0 ? ` (${gbp(m.plan.price_pence)})` : " (free)"}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{m.current_period_end ? fmtDate(m.current_period_end, "d MMM") : "?"}</td>
                    <td className="py-1.5 pr-3 text-ink-soft">{m.plan.price_pence > 0 ? (m.transfer_nudged_at ? fmtDate(m.transfer_nudged_at, "d MMM") : "not yet") : "team renews"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-brand">Members drifting away</h2>
            <Link href="/admin/people?flag=at_risk" className="text-sm text-brand">See all →</Link>
          </div>
          {d.atRisk.length === 0 ? (
            <p className="text-sm text-ink-soft">Nobody is drifting. Nice.</p>
          ) : (
            <ul className="divide-y divide-line">
              {d.atRisk.slice(0, 8).map((m) => (
                <li key={m.user_id} className="py-2 flex items-center justify-between text-sm">
                  <Link href={`/admin/people/${m.user_id}`} className="font-medium hover:text-brand">{m.full_name || m.email}</Link>
                  <span className="flex items-center gap-2 text-ink-soft">
                    {m.last_attended_at ? `last seen ${fmtDate(m.last_attended_at, "d MMM")}` : "never attended"}
                    <FlagPill flag={m.flag} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-brand">New members to welcome</h2>
            <Link href="/admin/people?flag=new" className="text-sm text-brand">See all →</Link>
          </div>
          {d.newMembers.length === 0 ? (
            <p className="text-sm text-ink-soft">No brand-new members waiting for a hello.</p>
          ) : (
            <ul className="divide-y divide-line">
              {d.newMembers.slice(0, 8).map((m) => (
                <li key={m.user_id} className="py-2 flex items-center justify-between text-sm">
                  <Link href={`/admin/people/${m.user_id}`} className="font-medium hover:text-brand">{m.full_name || m.email}</Link>
                  <span className="text-ink-soft">joined {m.member_since ? fmtDate(m.member_since, "d MMM") : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="font-semibold text-brand mb-3">Most attended classes (30 days)</h2>
          {d.popularClasses.length === 0 ? (
            <p className="text-sm text-ink-soft">No attendance yet.</p>
          ) : (
            <ul className="space-y-2">
              {d.popularClasses.map(([name, n]) => {
                const max = d.popularClasses[0][1];
                return (
                  <li key={name} className="text-sm">
                    <div className="flex justify-between"><span>{name}</span><span className="text-ink-soft">{n}</span></div>
                    <div className="h-1.5 rounded-full bg-bg-soft mt-1"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${(n / max) * 100}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="font-semibold text-brand mb-3">Latest payments</h2>
          {d.recentOrders.length === 0 ? (
            <p className="text-sm text-ink-soft">No payments yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {d.recentOrders.map((o) => (
                <li key={o.id} className="py-2 flex justify-between text-sm gap-3">
                  <span className="truncate">{o.profiles?.full_name ?? "—"} <span className="text-ink-soft">· {o.description}</span></span>
                  <span className="shrink-0">{gbp(o.amount_pence)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <h2 className="font-semibold text-brand mb-3">What's been happening</h2>
        <ul className="divide-y divide-line text-sm">
          {d.recentEvents.map((e) => (
            <li key={e.id} className="py-2 flex flex-wrap justify-between gap-x-3 gap-y-1">
              <span className="min-w-0 break-words"><span className="font-mono text-xs bg-bg-soft rounded px-1.5 py-0.5 mr-2 break-all">{e.type}</span>{e.profiles?.full_name ?? ""}</span>
              <span className="text-ink-soft shrink-0 text-xs sm:text-sm">{fmtDateTime(e.created_at)}{e.delivered_at ? "" : " · queued"}</span>
            </li>
          ))}
          {d.recentEvents.length === 0 && <li className="py-2 text-ink-soft">Quiet so far.</li>}
        </ul>
      </section>
    </div>
  );
}
