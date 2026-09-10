import Link from "next/link";
import { listUpcomingSessions } from "@/lib/booking";
import { SessionCard } from "@/components/session-card";
import { createAdminClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const [sessions, { data: settings }] = await Promise.all([
    listUpcomingSessions(7),
    createAdminClient().from("settings").select("club_name").eq("id", 1).single(),
  ]);
  const next = sessions.filter((s) => s.status === "scheduled").slice(0, 6);

  return (
    <div className="space-y-12">
      <section className="text-center py-10">
        <p className="text-xs uppercase tracking-[0.2em] text-accent mb-3">A community yoga club</p>
        <h1 className="text-4xl sm:text-5xl font-semibold text-brand max-w-2xl mx-auto leading-tight">
          {settings?.club_name ?? "Yoga in the Stars"}
        </h1>
        <p className="mt-4 text-ink-soft max-w-xl mx-auto">
          Daily classes, pay-as-you-wish sessions, breathwork, gigs and retreats, run by the people who practise here.
          Come as you are.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/schedule" className="btn-primary">See the schedule</Link>
          <Link href="/membership" className="btn-secondary">Join the club</Link>
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between mb-4">
          <h2 className="text-2xl font-semibold text-brand">This week</h2>
          <Link href="/schedule" className="text-sm text-brand">Full schedule →</Link>
        </div>
        {next.length === 0 ? (
          <div className="card text-center text-ink-soft py-10">The schedule for this week is on its way.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {next.map((s) => <SessionCard key={s.id} session={s} />)}
          </div>
        )}
      </section>
    </div>
  );
}
