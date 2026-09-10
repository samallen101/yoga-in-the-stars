import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/format";
import { PageHeader, Notice, StatusPill } from "@/components/ui";
import { saveClassType, createSessions, deleteSession, saveLocation } from "./actions";

export const metadata = { title: "Schedule admin" };

export default async function AdminSchedulePage({ searchParams }: PageProps<"/admin/schedule">) {
  const sp = await searchParams;
  const db = createAdminClient();
  const [{ data: types }, { data: teachers }, { data: locations }, { data: sessions }] = await Promise.all([
    db.from("class_types").select("*").order("name"),
    db.from("profiles").select("id, full_name").in("role", ["teacher", "admin"]).order("full_name"),
    db.from("locations").select("*").order("name"),
    db.from("class_sessions").select("*, class_types(name, colour), teacher:profiles!class_sessions_teacher_id_fkey(full_name)").gte("starts_at", new Date(Date.now() - 86400_000).toISOString()).order("starts_at").limit(120),
  ]);
  const ids = (sessions ?? []).map((s) => s.id);
  const { data: counts } = ids.length ? await db.from("session_booking_counts").select("*").in("session_id", ids) : { data: [] };
  const cmap = new Map((counts ?? []).map((c) => [c.session_id, c]));
  const msg = typeof sp.msg === "string" ? sp.msg : null;

  return (
    <div className="space-y-8">
      <PageHeader title="Schedule" intro="Class types are the templates. Sessions are the actual slots people book. Add a whole term of a weekly class in one go." />
      {msg && <Notice kind={msg.startsWith("✓") ? "success" : "error"}>{msg}</Notice>}

      <section className="grid gap-6 lg:grid-cols-2">
        <form action={createSessions} className="card space-y-3">
          <h2 className="font-semibold text-brand">Add sessions</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Class type</label>
              <select name="class_type_id" className="input" required>
                {(types ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Teacher</label>
              <select name="teacher_id" className="input">
                <option value="">Unassigned</option>
                {(teachers ?? []).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Location</label>
              <select name="location_id" className="input">
                <option value="">Default</option>
                {(locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">First date</label>
              <input name="date" type="date" className="input" required />
            </div>
            <div>
              <label className="label">Start time</label>
              <input name="time" type="time" className="input" required defaultValue="18:30" />
            </div>
            <div>
              <label className="label">Repeat weekly for</label>
              <select name="weeks" className="input">
                {[1, 2, 4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n === 1 ? "Just once" : `${n} weeks`}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Capacity</label>
              <input name="capacity" type="number" className="input" placeholder="type default" />
            </div>
            <div>
              <label className="label">Pricing</label>
              <select name="pricing" className="input">
                <option value="">Type default</option>
                <option value="members_included">Members included</option>
                <option value="drop_in">Drop-in only</option>
                <option value="pay_what_you_wish">Pay what you wish</option>
                <option value="free">Free</option>
              </select>
            </div>
            <div>
              <label className="label">Drop-in price (£)</label>
              <input name="drop_in" type="number" step="0.5" className="input" placeholder="type default" />
            </div>
          </div>
          <button className="btn-primary">Add to schedule</button>
        </form>

        <div className="space-y-6">
          <form action={saveClassType} className="card space-y-3">
            <h2 className="font-semibold text-brand">New class type</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label">Name</label><input name="name" className="input" required placeholder="Slow Flow" /></div>
              <div className="col-span-2"><label className="label">Description</label><textarea name="description" rows={2} className="input" /></div>
              <div><label className="label">Minutes</label><input name="duration_minutes" type="number" defaultValue={60} className="input" /></div>
              <div><label className="label">Capacity</label><input name="default_capacity" type="number" defaultValue={16} className="input" /></div>
              <div><label className="label">Colour</label><input name="colour" type="color" defaultValue="#7c6f9f" className="input h-10 p-1" /></div>
              <div><label className="label">Drop-in (£)</label><input name="default_drop_in" type="number" step="0.5" defaultValue={12} className="input" /></div>
              <div className="col-span-2">
                <label className="label">Default pricing</label>
                <select name="default_pricing" className="input">
                  <option value="members_included">Members included</option>
                  <option value="drop_in">Drop-in only</option>
                  <option value="pay_what_you_wish">Pay what you wish</option>
                  <option value="free">Free</option>
                </select>
              </div>
            </div>
            <button className="btn-secondary">Save class type</button>
            {(types ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1 pt-2 border-t border-line">
                {types!.map((t) => <span key={t.id} className="pill text-white" style={{ background: t.colour }}>{t.name}</span>)}
              </div>
            )}
          </form>

          <form action={saveLocation} className="card flex gap-2 items-end">
            <div className="flex-1"><label className="label">Add a location</label><input name="name" className="input" placeholder="The Room Above the Pub" required /></div>
            <button className="btn-secondary">Add</button>
          </form>
        </div>
      </section>

      <section className="card p-0 overflow-x-auto">
        <div className="px-5 py-3 border-b border-line font-semibold text-brand">Upcoming sessions</div>
        <table className="table">
          <thead><tr><th className="pl-5">When</th><th>Class</th><th>Teacher</th><th>Booked</th><th>Pricing</th><th className="pr-5"></th></tr></thead>
          <tbody>
            {(sessions ?? []).map((s) => {
              const c = cmap.get(s.id);
              return (
                <tr key={s.id}>
                  <td className="pl-5 whitespace-nowrap"><Link href={`/teach/${s.id}`} className="text-brand">{fmtDateTime(s.starts_at)}</Link></td>
                  <td>{s.class_types.name} {s.status !== "scheduled" && <StatusPill status={s.status} />}</td>
                  <td className="text-ink-soft">{s.teacher?.full_name ?? "—"}</td>
                  <td>{Number(c?.booked ?? 0)}/{s.capacity}</td>
                  <td className="text-ink-soft text-xs">{s.pricing.replace(/_/g, " ")}</td>
                  <td className="pr-5 text-right">
                    {Number(c?.booked ?? 0) === 0 && (
                      <form action={deleteSession}><input type="hidden" name="id" value={s.id} /><button className="btn-ghost text-xs">Delete</button></form>
                    )}
                  </td>
                </tr>
              );
            })}
            {(sessions ?? []).length === 0 && <tr><td colSpan={6} className="py-8 text-center text-ink-soft">Nothing scheduled yet. Add a class type, then add sessions.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
