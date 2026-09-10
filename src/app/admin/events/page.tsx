import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime, gbp } from "@/lib/format";
import { PageHeader, Notice, StatusPill } from "@/components/ui";
import { saveEvent, saveTicket, setEventStatus } from "./actions";

export const metadata = { title: "Events admin" };

export default async function AdminEventsPage({ searchParams }: PageProps<"/admin/events">) {
  const sp = await searchParams;
  const db = createAdminClient();
  const [{ data: events }, { data: locations }] = await Promise.all([
    db.from("events").select("*, event_tickets(*), locations(name)").order("starts_at", { ascending: false }).limit(30),
    db.from("locations").select("id, name").order("name"),
  ]);
  const ids = (events ?? []).map((e) => e.id);
  const { data: sold } = ids.length ? await db.from("orders").select("event_id, event_ticket_id, quantity, amount_pence").in("event_id", ids).eq("status", "paid") : { data: [] };
  const soldMap = new Map<string, { qty: number; pence: number }>();
  for (const o of sold ?? []) {
    if (!o.event_id) continue;
    const cur = soldMap.get(o.event_id) ?? { qty: 0, pence: 0 };
    soldMap.set(o.event_id, { qty: cur.qty + o.quantity, pence: cur.pence + o.amount_pence });
  }
  const msg = typeof sp.msg === "string" ? sp.msg : null;

  return (
    <div className="space-y-8">
      <PageHeader title="Events" intro="Gigs, breathwork, retreats. Set a member price on any ticket and it applies automatically to signed-in members. Tick members-only to hide it from everyone else." />
      {msg && <Notice kind={msg.startsWith("✓") ? "success" : "error"}>{msg}</Notice>}

      <form action={saveEvent} className="card space-y-3">
        <h2 className="font-semibold text-brand">New event</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="label">Title</label><input name="title" className="input" required /></div>
          <div className="col-span-2"><label className="label">Description</label><textarea name="description" rows={3} className="input" /></div>
          <div><label className="label">Starts</label><input name="starts_at" type="datetime-local" className="input" required /></div>
          <div><label className="label">Ends</label><input name="ends_at" type="datetime-local" className="input" /></div>
          <div><label className="label">Location</label><select name="location_id" className="input"><option value="">—</option>{(locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
          <div><label className="label">Image URL</label><input name="image_url" className="input" placeholder="https://..." /></div>
        </div>
        <button className="btn-primary">Create as draft</button>
      </form>

      <div className="space-y-4">
        {(events ?? []).map((e) => {
          const s = soldMap.get(e.id);
          return (
            <section key={e.id} className="card space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-ink-soft">{fmtDateTime(e.starts_at)}{e.locations?.name ? ` · ${e.locations.name}` : ""}</div>
                  <h3 className="text-lg font-semibold"><Link href={`/events/${e.slug}`} className="hover:text-brand">{e.title}</Link></h3>
                  <div className="text-sm text-ink-soft">{s ? `${s.qty} tickets sold · ${gbp(s.pence)}` : "No sales yet"}</div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={e.status} />
                  {e.status !== "published" && (
                    <form action={setEventStatus}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="published" /><button className="btn-secondary text-xs">Publish</button></form>
                  )}
                  {e.status === "published" && (
                    <form action={setEventStatus}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="draft" /><button className="btn-ghost text-xs">Unpublish</button></form>
                  )}
                </div>
              </div>

              <ul className="text-sm divide-y divide-line">
                {[...e.event_tickets].sort((a, b) => a.sort_order - b.sort_order).map((t) => (
                  <li key={t.id} className="py-2 flex justify-between">
                    <span>{t.name}{t.members_only && <span className="pill bg-brand-soft text-brand ml-2">members only</span>}</span>
                    <span className="text-ink-soft">{gbp(t.price_pence)}{t.member_price_pence != null ? ` · members ${gbp(t.member_price_pence)}` : ""}{t.quantity != null ? ` · ${t.quantity} available` : ""}</span>
                  </li>
                ))}
              </ul>

              <form action={saveTicket} className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end border-t border-line pt-3">
                <input type="hidden" name="event_id" value={e.id} />
                <div className="col-span-2"><label className="label">Ticket name</label><input name="name" className="input" required placeholder="General" /></div>
                <div><label className="label">Price £</label><input name="price" type="number" step="0.5" className="input" required /></div>
                <div><label className="label">Member £</label><input name="member_price" type="number" step="0.5" className="input" placeholder="same" /></div>
                <div><label className="label">Qty</label><input name="quantity" type="number" className="input" placeholder="∞" /></div>
                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-1 text-xs text-ink-soft"><input type="checkbox" name="members_only" /> Members only</label>
                  <button className="btn-secondary text-xs">Add ticket</button>
                </div>
              </form>
            </section>
          );
        })}
      </div>
    </div>
  );
}
