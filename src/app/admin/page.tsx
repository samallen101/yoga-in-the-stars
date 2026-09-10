import Link from "next/link";
import { getDashboard } from "@/lib/admin";
import { fmtDate, fmtDateTime, gbp } from "@/lib/format";
import { PageHeader, Stat, FlagPill } from "@/components/ui";

export const metadata = { title: "Admin" };

export default async function AdminDashboard() {
  const d = await getDashboard();
  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" intro="The numbers Momo never gave you." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active members" value={d.memberCount} hint={`${d.joinedThisMonth} joined · ${d.cancelledThisMonth} left this month`} />
        <Stat label="Need a nudge" value={d.flags.orange + d.flags.red} hint={`${d.flags.orange} orange · ${d.flags.red} red`} tone={d.flags.red > 0 ? "red" : d.flags.orange > 0 ? "orange" : "green"} />
        <Stat label="Attendances (30 days)" value={d.attendance30} hint="Booked or checked in" />
        <Stat label="Taken (30 days)" value={gbp(d.revenue30)} hint="Via Stripe, all products" />
      </div>

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
            <li key={e.id} className="py-2 flex justify-between gap-3">
              <span><span className="font-mono text-xs bg-bg-soft rounded px-1.5 py-0.5 mr-2">{e.type}</span>{e.profiles?.full_name ?? ""}</span>
              <span className="text-ink-soft shrink-0">{fmtDateTime(e.created_at)}{e.delivered_at ? "" : " · queued"}</span>
            </li>
          ))}
          {d.recentEvents.length === 0 && <li className="py-2 text-ink-soft">Quiet so far.</li>}
        </ul>
      </section>
    </div>
  );
}
