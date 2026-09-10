import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";

/**
 * Write a business event to the outbox. A cron job forwards undelivered events
 * to n8n (see /api/cron/outbox), which turns them into WhatsApp messages, team
 * pings and anything else the club wants to automate.
 *
 * Event types used across the app:
 *   user.registered, membership.purchased, membership.renewed, membership.paused,
 *   membership.cancelled, membership.payment_failed, class_pass.purchased,
 *   booking.created, booking.waitlisted, booking.promoted, booking.cancelled,
 *   session.cancelled, event_ticket.purchased, engagement.flag_changed, broadcast.sent
 */
export async function emit(type: string, userId: string | null, payload: Record<string, unknown>) {
  const db = createAdminClient();
  await db.from("outbox_events").insert({ type, user_id: userId, payload: payload as Json });
}

/** Push undelivered events to n8n. Returns how many were delivered. */
export async function flushOutbox(limit = 50) {
  const db = createAdminClient();
  const url = process.env.N8N_WEBHOOK_URL;
  const { data: events } = await db
    .from("outbox_events")
    .select("*, profiles(id, email, full_name, phone, whatsapp_opt_in)")
    .is("delivered_at", null)
    .lt("attempts", 10)
    .order("created_at")
    .limit(limit);

  if (!events?.length) return { delivered: 0, failed: 0 };
  if (!url) {
    // No n8n configured yet: mark as delivered so the table doesn't grow forever, but log it.
    console.log(`[outbox] N8N_WEBHOOK_URL not set; dropping ${events.length} event(s)`);
    await db.from("outbox_events").update({ delivered_at: new Date().toISOString(), last_error: "no webhook configured" }).in("id", events.map((e) => e.id));
    return { delivered: 0, failed: events.length };
  }

  const { data: settings } = await db.from("settings").select("club_name, whatsapp_team_numbers, whatsapp_community_url, contact_whatsapp").eq("id", 1).single();
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");

  let delivered = 0;
  let failed = 0;
  for (const e of events) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Stars-Secret": process.env.OUTBOX_SECRET ?? "" },
        body: JSON.stringify({
          id: e.id,
          type: e.type,
          created_at: e.created_at,
          user: e.profiles,
          payload: e.payload,
          club: {
            name: settings?.club_name ?? "Yoga in the Stars",
            team_numbers: settings?.whatsapp_team_numbers ?? [],
            community_url: settings?.whatsapp_community_url ?? null,
            site_url: site,
          },
        }),
      });
      if (!res.ok) throw new Error(`n8n responded ${res.status}`);
      await db.from("outbox_events").update({ delivered_at: new Date().toISOString(), attempts: e.attempts + 1 }).eq("id", e.id);
      delivered++;
    } catch (err) {
      failed++;
      await db.from("outbox_events").update({ attempts: e.attempts + 1, last_error: String(err) }).eq("id", e.id);
    }
  }
  return { delivered, failed };
}
