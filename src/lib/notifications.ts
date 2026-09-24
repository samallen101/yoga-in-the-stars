import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { memberEmail } from "@/lib/member-messages";

type Payload = Record<string, unknown>;

/**
 * Turn outbox events into the emails the app sends itself (confirmations,
 * cancellations, welcome). WhatsApp and team pings are n8n's job, driven by the
 * same events. emailed_at is set so nothing is ever re-sent.
 */
export async function sendTransactionalEmails(limit = 50) {
  const db = createAdminClient();
  const { data: events } = await db
    .from("outbox_events")
    .select("*, profiles(email, full_name)")
    .is("emailed_at", null)
    .order("created_at")
    .limit(limit);

  const { data: settings } = await db.from("settings").select("*").eq("id", 1).single();
  const club = settings?.club_name ?? "Yoga in the Stars";
  let sent = 0;

  for (const e of events ?? []) {
    const payload = (e.payload ?? {}) as Payload;
    if (!e.profiles?.email && e.type !== "session.cancelled" && e.type !== "session.moved") {
      await db.from("outbox_events").update({ emailed_at: new Date().toISOString() }).eq("id", e.id);
      continue;
    }
    const first = (e.profiles?.full_name ?? "there").split(" ")[0];
    const to = e.profiles?.email ?? "";
    const p = payload as Record<string, string | number | boolean | null | undefined>;

    const mail = memberEmail(e.type, p, first, club, settings?.whatsapp_community_url);

    // Session moved (e.g. the pub has the room): one email per booked or waitlisted person.
    if (e.type === "session.moved") {
      const ids = (payload.affected_user_ids as string[]) ?? [];
      if (ids.length) {
        const { data: people } = await db.from("profiles").select("email, full_name").in("id", ids);
        for (const person of people ?? []) {
          const m = memberEmail("session.moved", p, (person.full_name ?? "there").split(" ")[0], club)!;
          const r = await sendEmail({ to: person.email, ...m });
          if (!r.held) sent++;
        }
      }
      await db.from("outbox_events").update({ emailed_at: new Date().toISOString() }).eq("id", e.id);
      continue;
    }

    // Session cancelled: one email per affected person (the event is attached to the staff member who cancelled).
    if (e.type === "session.cancelled") {
      const ids = (payload.affected_user_ids as string[]) ?? [];
      if (ids.length) {
        const { data: people } = await db.from("profiles").select("email, full_name").in("id", ids);
        for (const person of people ?? []) {
          const m = memberEmail("session.cancelled", p, (person.full_name ?? "there").split(" ")[0], club)!;
          await sendEmail({ to: person.email, ...m });
          sent++;
        }
      }
      await db.from("outbox_events").update({ emailed_at: new Date().toISOString() }).eq("id", e.id);
      continue;
    }

    let held = false;
    if (mail && to) {
      const r = await sendEmail({ to, ...mail });
      if (r.held) held = true;
      else sent++;
    }
    await db.from("outbox_events").update({ emailed_at: new Date().toISOString(), email_held: held }).eq("id", e.id);
  }
  return { sent };
}
