"use server";

import { redirect } from "next/navigation";
import { createAdminClient, getCurrentUser } from "@/lib/supabase/server";
import { checkoutForEventTicket } from "@/lib/checkout";

export async function buyTicket(formData: FormData) {
  const eventId = String(formData.get("event_id"));
  const ticketId = String(formData.get("ticket_id"));
  const q = Math.floor(Number(formData.get("quantity") ?? 1));
  const quantity = Number.isFinite(q) ? Math.min(4, Math.max(1, q)) : 1;
  const db = createAdminClient();

  const { data: event } = await db.from("events").select("*").eq("id", eventId).single();
  if (!event) redirect("/events");
  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=/events/${event.slug}`);
  // Same rule as the event page: drafts are visible to staff only (for a test
  // purchase), and nothing can be bought once an event is cancelled or over.
  if (event.status === "cancelled" || event.status === "completed" || (event.status === "draft" && me.profile.role === "yogi")) {
    redirect(`/events/${event.slug}?msg=${encodeURIComponent("Tickets for this event aren't on sale.")}`);
  }

  const { data: ticket } = await db.from("event_tickets").select("*").eq("id", ticketId).eq("event_id", eventId).single();
  if (!ticket) redirect(`/events/${event.slug}?msg=${encodeURIComponent("Ticket not found.")}`);

  const { data: member } = await db.rpc("is_active_member", { uid: me.user.id });
  const isMember = Boolean(member);

  if (ticket.quantity != null) {
    const { data: sold } = await db.from("orders").select("quantity").eq("event_ticket_id", ticket.id).eq("status", "paid");
    const soldCount = (sold ?? []).reduce((n, o) => n + o.quantity, 0);
    if (soldCount + quantity > ticket.quantity) {
      redirect(`/events/${event.slug}?msg=${encodeURIComponent("Not enough tickets left.")}`);
    }
  }

  let url: string;
  try {
    url = await checkoutForEventTicket({ profile: me.profile, event, ticket, quantity, isMember });
  } catch (err) {
    redirect(`/events/${event.slug}?msg=${encodeURIComponent(err instanceof Error ? err.message : "Could not start checkout.")}`);
  }
  redirect(url);
}
