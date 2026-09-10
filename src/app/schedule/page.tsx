import { listUpcomingSessions } from "@/lib/booking";
import { SessionCard } from "@/components/session-card";
import { PageHeader, Empty } from "@/components/ui";
import { dayKey, fmtDate } from "@/lib/format";

export const metadata = { title: "Schedule" };

export default async function SchedulePage() {
  const sessions = await listUpcomingSessions(21);
  const byDay = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const k = dayKey(s.starts_at);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }

  return (
    <div>
      <PageHeader title="Schedule" intro="Book with your membership or class pass, drop in, or pay what you wish on community sessions." />
      {sessions.length === 0 ? (
        <Empty>No classes scheduled in the next three weeks yet.</Empty>
      ) : (
        <div className="space-y-8">
          {[...byDay.entries()].map(([day, list]) => (
            <section key={day}>
              <h2 className="text-lg font-semibold text-brand mb-3">{fmtDate(list[0].starts_at, "EEEE d MMMM")}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((s) => <SessionCard key={s.id} session={s} compact />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
