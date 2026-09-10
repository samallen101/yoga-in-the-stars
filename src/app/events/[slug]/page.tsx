import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient, getCurrentUser } from "@/lib/supabase/server";
import { fmtDate, fmtTime, gbp } from "@/lib/format";
import { BackLink, Notice } from "@/components/ui";
import { buyTicket } from "./actions";

export default async function EventPage({ params, searchParams }: PageProps<"/events/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const db = createAdminClient();
  const me = await getCurrentUser();

  const { data: event } = await db
    .from("events")
    .select("*, locations(name, address), event_tickets(*)")
    .eq("slug", slug)
    .single();
  if (!event || (event.status !== "published" && !(me && me.profile.role !== "yogi"))) notFound();

  let isMember = false;
  if (me) {
    const { data } = await db.rpc("is_active_member", { uid: me.user.id });
    isMember = Boolean(data);
  }

  const { data: sold } = await db
    .from("orders")
    .select("event_ticket_id, quantity")
    .eq("event_id", event.id)
    .eq("status", "paid");
  const soldByTicket = new Map<string, number>();
  for (const o of sold ?? []) if (o.event_ticket_id) soldByTicket.set(o.event_ticket_id, (soldByTicket.get(o.event_ticket_id) ?? 0) + o.quantity);

  const tickets = [...(event.event_tickets ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const msg = typeof sp.msg === "string" ? sp.msg : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <BackLink href="/events">Events</BackLink>

      <div className="card">
        {event.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.image_url} alt="" className="-mx-5 -mt-5 mb-4 h-56 w-[calc(100%+2.5rem)] object-cover rounded-t-2xl" />
        )}
        <div className="text-xs text-ink-soft">
          {fmtDate(event.starts_at, "EEEE d MMMM")} · {fmtTime(event.starts_at)}{event.ends_at ? `–${fmtTime(event.ends_at)}` : ""}
          {event.locations?.name ? ` · ${event.locations.name}` : ""}
        </div>
        <h1 className="text-3xl font-semibold text-brand mt-1">{event.title}</h1>
        {event.description && <p className="mt-4 text-sm leading-relaxed whitespace-pre-line">{event.description}</p>}
      </div>

      {sp.paid === "1" && <Notice kind="success">You're in. Your ticket is confirmed and a receipt is on its way.</Notice>}
      {msg && <Notice kind="error">{msg}</Notice>}

      <div className="card space-y-4">
        <h2 className="font-semibold text-brand">Tickets</h2>
        {tickets.length === 0 && <p className="text-sm text-ink-soft">Tickets aren't on sale yet.</p>}
        {tickets.map((t) => {
          const soldOut = t.quantity != null && (soldByTicket.get(t.id) ?? 0) >= t.quantity;
          const memberPrice = t.member_price_pence != null && t.member_price_pence < t.price_pence;
          const youPay = isMember && t.member_price_pence != null ? t.member_price_pence : t.price_pence;
          const locked = t.members_only && !isMember;
          return (
            <form key={t.id} action={buyTicket} className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 first:border-0 first:pt-0">
              <input type="hidden" name="event_id" value={event.id} />
              <input type="hidden" name="ticket_id" value={t.id} />
              <div>
                <div className="font-medium">
                  {t.name}
                  {t.members_only && <span className="pill bg-brand-soft text-brand ml-2">Members only</span>}
                </div>
                <div className="text-sm text-ink-soft">
                  {isMember && memberPrice ? (
                    <>
                      <span className="line-through mr-1">{gbp(t.price_pence)}</span>
                      <span className="text-green font-medium">{gbp(t.member_price_pence!)} member price</span>
                    </>
                  ) : (
                    <>
                      {gbp(t.price_pence)}
                      {memberPrice && <span className="ml-2 text-green">· {gbp(t.member_price_pence!)} for members</span>}
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {soldOut ? (
                  <span className="pill bg-red-soft text-red">Sold out</span>
                ) : !me ? (
                  <Link href={`/login?next=/events/${event.slug}`} className="btn-secondary">Sign in to book</Link>
                ) : locked ? (
                  <Link href="/membership" className="btn-secondary">Join to unlock</Link>
                ) : (
                  <>
                    <select name="quantity" className="input w-auto py-2">
                      {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <button className="btn-primary">{youPay === 0 ? "Reserve" : `Buy · ${gbp(youPay)}`}</button>
                  </>
                )}
              </div>
            </form>
          );
        })}
        {!isMember && tickets.some((t) => t.member_price_pence != null || t.members_only) && (
          <p className="text-xs text-ink-soft">
            Member prices apply automatically when you're signed in as a member. <Link href="/membership" className="text-brand underline">Join the club</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
