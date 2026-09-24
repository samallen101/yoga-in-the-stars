import "server-only";
import { fmtDateTime, gbp } from "@/lib/format";
import { siteUrl } from "@/lib/stripe";

/**
 * The wording of every email the site sends to members, in one place. The
 * sender (notifications.ts) and the Admin, Messages preview both use this, so
 * what Tarin reads in the preview is exactly what members get.
 */
export type MemberEmail = { subject: string; text: string };
type P = Record<string, string | number | boolean | null | undefined>;

export function memberEmail(type: string, p: P, first: string, club: string, communityUrl?: string | null): MemberEmail | null {
  switch (type) {
    case "user.registered":
      return {
        subject: `Welcome to ${club}`,
        text: `Hi ${first},\n\nYour account is ready. Have a look at the schedule and book your first class:\n${siteUrl("/schedule")}\n\nIf you'd like every class included, memberships are here:\n${siteUrl("/membership")}\n\nSee you on the mat,\n${club}`,
      };
    case "membership.purchased":
    case "membership.granted":
      return {
        subject: `You're in. Welcome to the club`,
        text: `Hi ${first},\n\nYour ${p.plan} is active. Every regular class is now included, and you get member prices on events.\n\nBook classes: ${siteUrl("/schedule")}\nManage your membership: ${siteUrl("/me")}${communityUrl ? `\n\nJoin the members' WhatsApp community: ${communityUrl}` : ""}\n\nThank you for keeping the space alive.\n${club}`,
      };
    case "membership.moved":
      return {
        subject: `Your membership has moved over`,
        text: `Hi ${first},\n\nThank you. Your ${p.plan} is now set up on the new site${p.trial ? ` and your first payment is on ${fmtDateTime(String(p.starts_billing)).split(", ")[0]}, when your current paid period ends. Nothing is charged before then.` : `.`}\n\nBook classes: ${siteUrl("/schedule")}\nManage your membership: ${siteUrl("/me")}\n\n${club}`,
      };
    case "membership.transfer_needed":
      return {
        subject: `Your membership has moved to our new booking site`,
        text: `Hi ${first},\n\nAs you'll have heard, we've moved our bookings from Momo to our own site, and your ${p.plan} came with us. Momo has stopped your old renewal, so nothing more will be taken there.\n\nTo carry on after ${fmtDateTime(String(p.period_end)).split(", ")[0]}, add your card here. It takes a minute, and nothing is charged until then:\n${siteUrl("/me")}\n\nAny questions, just reply to this email.\n${club}`,
      };
    case "class_pass.purchased":
    case "class_pass.granted":
      return {
        subject: `Your ${p.product} is ready`,
        text: `Hi ${first},\n\nYou have ${p.credits} classes to use before ${fmtDateTime(String(p.expires_at))}. Book from the schedule and a credit is used automatically:\n${siteUrl("/schedule")}\n\n${club}`,
      };
    case "booking.created":
      return {
        subject: `Booked: ${p.class_name}, ${fmtDateTime(String(p.starts_at))}`,
        text: `Hi ${first},\n\nYou're booked on ${p.class_name} on ${fmtDateTime(String(p.starts_at))}${p.teacher ? ` with ${p.teacher}` : ""}.\n\nNeed to cancel? Do it from My club: ${siteUrl("/me")}\n\n${club}`,
      };
    case "booking.waitlisted":
      return {
        subject: `Waitlist: ${p.class_name}, ${fmtDateTime(String(p.starts_at))}`,
        text: `Hi ${first},\n\n${p.class_name} on ${fmtDateTime(String(p.starts_at))} is full, so you're on the waitlist. We'll let you know the moment a space opens up.\n\n${club}`,
      };
    case "booking.promoted":
      return {
        subject: `A space opened up: ${p.class_name}`,
        text: `Hi ${first},\n\nGood news, you're now booked on ${p.class_name} on ${fmtDateTime(String(p.starts_at))}. If you can't make it any more, please cancel from My club so someone else can have the space: ${siteUrl("/me")}\n\n${club}`,
      };
    case "booking.cancelled":
      return {
        subject: `Cancelled: ${p.class_name}`,
        text: `Hi ${first},\n\nYour booking for ${p.class_name} on ${fmtDateTime(String(p.starts_at))} has been cancelled.${p.late_cancel && p.paid_with === "class_pass" ? " As it was a late cancellation the class pass credit wasn't returned." : ""}\n\n${club}`,
      };
    case "booking.reminder":
      return {
        subject: `Tomorrow: ${p.class_name} at ${fmtDateTime(String(p.starts_at)).split(", ")[1]}`,
        text: `Hi ${first},\n\nA quick reminder that you're booked on ${p.class_name} tomorrow, ${fmtDateTime(String(p.starts_at))}${p.teacher ? ` with ${p.teacher}` : ""}.\n\nCan't make it? Cancel from My club so someone on the waitlist can come: ${siteUrl("/me")}\n\n${club}`,
      };
    case "event_ticket.purchased":
      return {
        subject: `Your ticket: ${p.event}`,
        text: `Hi ${first},\n\nYou're coming to ${p.event} on ${fmtDateTime(String(p.starts_at))}. ${Number(p.quantity) > 1 ? `${p.quantity} tickets` : "1 ticket"}${Number(p.amount_pence) > 0 ? ` · ${gbp(Number(p.amount_pence))}` : ""}${p.member_price ? " (member price)" : ""}.\n\nJust give your name on the door.\n\n${club}`,
      };
    case "membership.payment_failed":
      return {
        subject: `Your membership payment didn't go through`,
        text: `Hi ${first},\n\nYour last payment for ${p.plan} failed, usually because a card expired. You can update it in a few seconds here:\n${siteUrl("/me")}\n\nNo stress, and shout if you need anything.\n${club}`,
      };
    case "class_pass.expiring":
      return {
        subject: `Your class pass expires soon`,
        text: `Hi ${first},\n\nYou still have ${p.credits_remaining} classes on your pass and it expires on ${fmtDateTime(String(p.expires_at))}. Book them in: ${siteUrl("/schedule")}\n\n${club}`,
      };
    // one per person booked or waitlisted
    case "session.moved":
      return {
        subject: `Time change: ${p.class_name} is now ${fmtDateTime(String(p.starts_at))}`,
        text: `Hi ${first},\n\n${p.class_name} has moved from ${fmtDateTime(String(p.from))} to ${fmtDateTime(String(p.starts_at))}.${p.reason ? `\n\n${p.reason}` : ""}\n\nYou're still booked. If the new time doesn't work, cancel from My club (${siteUrl("/me")}), or just reply to this email and we'll make sure you get your credit back.\n\n${club}`,
      };
    case "session.cancelled":
      return {
        subject: `Cancelled: ${p.class_name} on ${fmtDateTime(String(p.starts_at))}`,
        text: `Hi ${first},\n\nSorry, ${p.class_name} on ${fmtDateTime(String(p.starts_at))} has been cancelled.${p.reason ? `\n\n${p.reason}` : ""}\n\nAny class pass credit has gone back on your pass. If you paid for a drop-in we'll sort a refund.\n\nSee what else is on: ${siteUrl("/schedule")}\n\n${club}`,
      };
  }
  return null;
}
