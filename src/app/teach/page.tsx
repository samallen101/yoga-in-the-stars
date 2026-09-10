import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient, getCurrentUser } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/format";
import { PageHeader, Empty, StatusPill } from "@/components/ui";

export const metadata = { title: "Teach" };

export default async function TeachPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/teach");
  if (me.profile.role === "yogi") redirect("/me");
  const db = createAdminClient();

  let q = db
    .from("class_sessions")
    .select("*, class_types(name, colour), teacher:profiles!class_sessions_teacher_id_fkey(full_name)")
    .gte("starts_at", new Date(Date.now() - 3 * 3600_000).toISOString())
    .order("starts_at")
    .limit(40);
  if (me.profile.role === "teacher") q = q.eq("teacher_id", me.user.id);
  const { data: sessions } = await q;

  const ids = (sessions ?? []).map((s) => s.id);
  const { data: counts } = ids.length ? await db.from("session_booking_counts").select("*").in("session_id", ids) : { data: [] };
  const cmap = new Map((counts ?? []).map((c) => [c.session_id, c]));

  return (
    <div>
      <PageHeader
        title={me.profile.role === "admin" ? "All upcoming classes" : "Your classes"}
        intro="Tap a class to see who's coming, check people in, or cancel it and let everyone know in one go."
      />
      {(sessions ?? []).length === 0 ? (
        <Empty>No upcoming classes assigned to you.</Empty>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="pl-5">When</th>
                <th>Class</th>
                {me.profile.role === "admin" && <th>Teacher</th>}
                <th>Booked</th>
                <th className="pr-5">Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions!.map((s) => {
                const c = cmap.get(s.id);
                return (
                  <tr key={s.id} className="hover:bg-bg-soft/60">
                    <td className="pl-5 whitespace-nowrap"><Link href={`/teach/${s.id}`} className="text-brand font-medium">{fmtDateTime(s.starts_at)}</Link></td>
                    <td><span className="inline-block h-2 w-2 rounded-full mr-2" style={{ background: s.class_types.colour }} />{s.class_types.name}</td>
                    {me.profile.role === "admin" && <td className="text-ink-soft">{s.teacher?.full_name ?? "—"}</td>}
                    <td>{Number(c?.booked ?? 0)}/{s.capacity}{Number(c?.waitlisted ?? 0) > 0 ? ` (+${c!.waitlisted} waiting)` : ""}</td>
                    <td className="pr-5"><StatusPill status={s.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
