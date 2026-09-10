import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate, fmtTime, gbp } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui";

export const metadata = { title: "Events" };

export default async function EventsPage() {
  const db = createAdminClient();
  const { data: events } = await db
    .from("events")
    .select("*, locations(name), event_tickets(price_pence, member_price_pence, members_only)")
    .eq("status", "published")
    .gte("starts_at", new Date(Date.now() - 6 * 3600_000).toISOString())
    .order("starts_at");

  return (
    <div>
      <PageHeader title="Events" intro="Gigs, breathwork, retreats and the occasional party. Members get member prices automatically." />
      {(events ?? []).length === 0 ? (
        <Empty>Nothing on the calendar right now. Keep an eye on the members' WhatsApp.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {events!.map((e) => {
            const tickets = e.event_tickets ?? [];
            const from = tickets.length ? Math.min(...tickets.map((t) => t.price_pence)) : null;
            const memberFrom = tickets.length ? Math.min(...tickets.map((t) => t.member_price_pence ?? t.price_pence)) : null;
            return (
              <Link key={e.id} href={`/events/${e.slug}`} className="card hover:border-brand/40 transition overflow-hidden">
                {e.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.image_url} alt="" className="-mx-5 -mt-5 mb-4 h-40 w-[calc(100%+2.5rem)] object-cover" />
                )}
                <div className="text-xs text-ink-soft">{fmtDate(e.starts_at, "EEEE d MMMM")} · {fmtTime(e.starts_at)}{e.locations?.name ? ` · ${e.locations.name}` : ""}</div>
                <h2 className="text-xl font-semibold mt-1">{e.title}</h2>
                {e.description && <p className="text-sm text-ink-soft mt-2 line-clamp-2">{e.description}</p>}
                {from != null && (
                  <div className="mt-3 text-sm">
                    <span className="font-medium">{from === 0 ? "Free" : `From ${gbp(from)}`}</span>
                    {memberFrom != null && memberFrom < from && <span className="text-green ml-2">· members from {gbp(memberFrom)}</span>}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
