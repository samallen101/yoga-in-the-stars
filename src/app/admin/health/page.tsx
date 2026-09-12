import { runHealthChecks } from "@/lib/health";
import { createAdminClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Health" };
export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const [h, recent] = await Promise.all([
    runHealthChecks(),
    createAdminClient().from("outbox_events").select("id, type, created_at, delivered_at, emailed_at, attempts, last_error").order("created_at", { ascending: false }).limit(25),
  ]);
  const tone = h.status === "problem" ? "text-red" : h.status === "ok-with-warnings" ? "text-orange" : "text-green";
  const label = h.status === "problem" ? "Something needs attention" : h.status === "ok-with-warnings" ? "Working, with notes" : "All good";
  return (
    <div className="space-y-8">
      <PageHeader title="Health" intro="Is everything behind the site working right now? The same checks run every five minutes from n8n and alert Sam if they fail." />
      <div className="card">
        <div className="text-xs uppercase tracking-wide text-ink-soft">Right now</div>
        <div className={`mt-1 text-3xl font-semibold serif ${tone}`}>{label}</div>
        <div className="mt-1 text-xs text-ink-soft">checked {fmtDateTime(h.checked_at)} in {h.total_ms} ms</div>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {h.checks.map((c) => (
          <li key={c.name} className="card flex items-start gap-3">
            <span className={`mt-1 inline-block h-3 w-3 shrink-0 rounded-full ${!c.ok ? "bg-red" : c.warn ? "bg-orange" : "bg-green"}`} aria-hidden />
            <div>
              <div className="font-medium capitalize">{c.name} <span className="text-xs font-normal text-ink-soft">{!c.ok ? "problem" : c.warn ? "note" : "ok"}</span></div>
              <div className="text-sm text-ink-soft">{c.detail}{c.ms !== undefined ? ` (${c.ms} ms)` : ""}</div>
            </div>
          </li>
        ))}
      </ul>
      <section className="card">
        <h2 className="mb-3 font-semibold text-brand">Last 25 events</h2>
        <p className="mb-3 text-xs text-ink-soft">Everything the site tells the automations about. Delivered means n8n received it; emailed means the member email went (or was logged, until email is set up).</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-soft"><th className="py-2 pr-4">When</th><th className="py-2 pr-4">Event</th><th className="py-2 pr-4">Delivered</th><th className="py-2 pr-4">Emailed</th><th className="py-2 pr-4">Tries</th><th className="py-2">Last error</th></tr></thead>
            <tbody>
              {(recent.data ?? []).map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <td className="py-1.5 pr-4 whitespace-nowrap">{fmtDateTime(e.created_at)}</td>
                  <td className="py-1.5 pr-4">{e.type}</td>
                  <td className="py-1.5 pr-4">{e.delivered_at ? "yes" : <span className="text-orange">waiting</span>}</td>
                  <td className="py-1.5 pr-4">{e.emailed_at ? "yes" : "·"}</td>
                  <td className="py-1.5 pr-4">{e.attempts}</td>
                  <td className="py-1.5 text-xs text-ink-soft">{e.last_error ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
