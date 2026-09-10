import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { fmtDateTime, gbp } from "@/lib/format";
import { siteUrl } from "@/lib/stripe";

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
    if (!e.profiles?.email && e.type !== "session.cancelled") {
      await db.from("outbox_events").update({ emailed_at: new Date().toISOString() }).eq("id", e.id);
      continue;
    }
    const first = (e.profiles?.full_name ?? "there").split(" ")[0];
    const to = e.profiles?.email ?? "";
    const p = payload as Record<string, string | number | null | undefined>;
    let mail: { subject: string; text: string } | null = null;

    switch (e.type) {
      case "user.registered":
        mail = {
          subject: `Welcome to ${club}`,
          text: `Hi ${first},\n\nYour account is ready. Have a look at the schedule and book your first class:\n${siteUrl("/schedule")}\n\nIf you'd like every class included, memberships are here:\n${siteUrl("/membership")}\n\nSee you on the mat,\n${club}`,
        };
        break;
      case "membership.purchased":
      case "membership.granted":
        mail = {
          subject: `You're in. Welcome to the club`,
          text: `Hi ${first},\n\nYour ${p.plan} is active. Every regular class is now included, and you get member prices on events.\n\nBook classes: ${siteUrl("/schedule")}\nManage your membership: ${siteUrl("/me")}${settings?.whatsapp_community_url ? `\n\nJoin the members' WhatsApp community: ${settings.whatsapp_community_url}` : ""}\n\nThank you for keeping the space alive.\n${club}`,
        };
        break;
      case "class_pass.purchased":
      case "class_pass.granted":
        mail = {
          subject: `Your ${p.product} is ready`,
          text: `Hi ${first},\n\nYou have ${p.credits} classes to use before ${fmtDateTime(String(p.expires_at))}. Book from the schedule and a credit is used automatically:\n${siteUrl("/schedule")}\n\n${club}`,
        };
        break;
      case "booking.created":
        mail = {
          subject: `Booked: ${p.class_name}, ${fmtDateTime(String(p.starts_at))}`,
          text: `Hi ${first},\n\nYou're booked on ${p.class_name} on ${fmtDateTime(String(p.starts_at))}${p.teacher ? ` with ${p.teacher}` : ""}.\n\nNeed to cancel? Do it from My club: ${siteUrl("/me")}\n\n${club}`,
        };
        break;
      case "booking.waitlisted":
        mail = {
          subject: `Waitlist: ${p.class_name}, ${fmtDateTime(String(p.starts_at))}`,
          text: `Hi ${first},\n\n${p.class_name} on ${fmtDateTime(String(p.starts_at))} is full, so you're on the waitlist. We'll let you know the moment a space opens up.\n\n${club}`,
        };
        break;
      case "booking.promoted":
        mail = {
          subject: `A space opened up: ${p.class_name}`,
          text: `Hi ${first},\n\nGood news, you're now booked on ${p.class_name} on ${fmtDateTime(String(p.starts_at))}. If you can't make it any more, please cancel from My club so someone else can have the space: ${siteUrl("/me")}\n\n${club}`,
        };
        break;
      case "booking.cancelled":
        mail = {
          subject: `Cancelled: ${p.class_name}`,
          text: `Hi ${first},\n\nYour booking for ${p.class_name} on ${fmtDateTime(String(p.starts_at))} has been cancelled.${p.late_cancel && p.paid_with === "class_pass" ? " As it was a late cancellation the class pass credit wasn't returned." : ""}\n\n${club}`,
        };
        break;
      case "booking.reminder":
        mail = {
          subject: `Tomorrow: ${p.class_name} at ${fmtDateTime(String(p.starts_at)).split(", ")[1]}`,
          text: `Hi ${first},\n\nA quick reminder that you're booked on ${p.class_name} tomorrow, ${fmtDateTime(String(p.starts_at))}${p.teacher ? ` with ${p.teacher}` : ""}.\n\nCan't make it? Cancel from My club so someone on the waitlist can come: ${siteUrl("/me")}\n\n${club}`,
        };
        break;
      case "event_ticket.purchased":
        mail = {
          subject: `Your ticket: ${p.event}`,
          text: `Hi ${first},\n\nYou're coming to ${p.event} on ${fmtDateTime(String(p.starts_at))}. ${Number(p.quantity) > 1 ? `${p.quantity} tickets` : "1 ticket"}${Number(p.amount_pence) > 0 ? ` · ${gbp(Number(p.amount_pence))}` : ""}${p.member_price ? " (member price)" : ""}.\n\nJust give your name on the door.\n\n${club}`,
        };
        break;
      case "membership.payment_failed":
        mail = {
          subject: `Your membership payment didn't go through`,
          text: `Hi ${first},\n\nYour last payment for ${p.plan} failed, usually because a card expired. You can update it in a few seconds here:\n${siteUrl("/me")}\n\nNo stress, and shout if you need anything.\n${club}`,
        };
        break;
      case "class_pass.expiring":
        mail = {
          subject: `Your class pass expires soon`,
          text: `Hi ${first},\n\nYou still have ${p.credits_remaining} classes on your pass and it expires on ${fmtDateTime(String(p.expires_at))}. Book them in: ${siteUrl("/schedule")}\n\n${club}`,
        };
        break;
    }

    // Session cancelled: one email per affected person (the event is attached to the staff member who cancelled).
    if (e.type === "session.cancelled") {
      const ids = (payload.affected_user_ids as string[]) ?? [];
      if (ids.length) {
        const { data: people } = await db.from("profiles").select("email, full_name").in("id", ids);
        for (const person of people ?? []) {
          await sendEmail({
            to: person.email,
            subject: `Cancelled: ${p.class_name} on ${fmtDateTime(String(p.starts_at))}`,
            text: `Hi ${(person.full_name ?? "there").split(" ")[0]},\n\nSorry, ${p.class_name} on ${fmtDateTime(String(p.starts_at))} has been cancelled.${p.reason ? `\n\n${p.reason}` : ""}\n\nAny class pass credit has gone back on your pass. If you paid for a drop-in we'll sort a refund.\n\nSee what else is on: ${siteUrl("/schedule")}\n\n${club}`,
          });
          sent++;
        }
      }
      await db.from("outbox_events").update({ emailed_at: new Date().toISOString() }).eq("id", e.id);
      continue;
    }

    if (mail && to) {
      await sendEmail({ to, ...mail });
      sent++;
    }
    await db.from("outbox_events").update({ emailed_at: new Date().toISOString() }).eq("id", e.id);
  }
  return { sent };
}
