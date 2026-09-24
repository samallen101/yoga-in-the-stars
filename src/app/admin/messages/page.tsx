import { createAdminClient } from "@/lib/supabase/server";
import { memberEmail } from "@/lib/member-messages";
import { getGate } from "@/lib/gate";
import { PageHeader } from "@/components/ui";
import templates from "../../../../n8n/whatsapp-templates.json";

export const metadata = { title: "Messages" };

// Made-up details so every message can be shown in full.
const when = new Date(Date.now() + 5 * 86400_000);
when.setUTCHours(18, 0, 0, 0);
const earlier = new Date(when.getTime() - 86400_000);
const sample = {
  plan: "Standard membership", product: "3 Class Pass", credits: 3, credits_remaining: 2,
  expires_at: new Date(Date.now() + 40 * 86400_000).toISOString(),
  class_name: "Restorative Yoga + Somatic Meditation", starts_at: when.toISOString(), from: earlier.toISOString(),
  teacher: "Tarin Heaton-Heather", event: "Full Moon Ritual", quantity: 1, amount_pence: 1200, member_price: true,
  period_end: new Date(Date.now() + 20 * 86400_000).toISOString(), trial: true,
  starts_billing: new Date(Date.now() + 20 * 86400_000).toISOString(),
  reason: "The pub needs the room for a private party that evening.", late_cancel: false, paid_with: "class_pass",
};

const EMAILS: { group: string; items: { type: string; name: string; when: string }[] }[] = [
  { group: "Joining", items: [
    { type: "user.registered", name: "Welcome", when: "Someone creates an account on the site." },
    { type: "membership.purchased", name: "New member", when: "Someone buys a membership, or you give them one." },
    { type: "class_pass.purchased", name: "Class pass ready", when: "Someone buys a class pass, or you give them one." },
    { type: "event_ticket.purchased", name: "Event ticket", when: "Someone buys a ticket to an event." },
  ] },
  { group: "Booking", items: [
    { type: "booking.created", name: "Booked", when: "Someone books a class." },
    { type: "booking.waitlisted", name: "On the waitlist", when: "Someone joins the waitlist for a full class." },
    { type: "booking.promoted", name: "A space opened up", when: "Someone on the waitlist gets a place because another person cancelled." },
    { type: "booking.reminder", name: "Reminder", when: "The day before a class, to everyone booked." },
    { type: "booking.cancelled", name: "Cancelled by them", when: "Someone cancels their own booking, or you cancel it for them." },
  ] },
  { group: "Changes to a class", items: [
    { type: "session.moved", name: "Time change", when: "You move a class to a new time (Admin, Schedule, Edit). Goes to everyone booked or waitlisted. The reason is whatever you type." },
    { type: "session.cancelled", name: "Class cancelled", when: "You or the teacher cancel a class. Goes to everyone booked or waitlisted." },
  ] },
  { group: "Payments and passes", items: [
    { type: "membership.payment_failed", name: "Payment didn't go through", when: "A monthly membership payment fails, usually an expired card." },
    { type: "class_pass.expiring", name: "Pass expiring", when: "A class pass with credits left is a week from expiring." },
  ] },
  { group: "Moving over from Momo (switch-over only)", items: [
    { type: "membership.transfer_needed", name: "Please add your card", when: "Only after the go-live date: 14 days before a Momo member's paid period ends, if they haven't set up their card yet." },
    { type: "membership.moved", name: "Membership moved", when: "A Momo member sets up their card on the new site." },
  ] },
];

const WHATSAPP_NAMES: Record<string, { name: string; when: string }> = {
  yits_team_alert: { name: "Team alert (to you, not members)", when: "New member, failed payment, class moved: a ping to the team." },
  yits_welcome: { name: "Welcome", when: "Someone becomes a member." },
  yits_reminder: { name: "Reminder", when: "The day before a class." },
  yits_promoted: { name: "A space opened up", when: "Someone gets a place off the waitlist." },
  yits_cancelled: { name: "Class cancelled", when: "A class is cancelled." },
  yits_checkin: { name: "Check-in", when: "A paying member hasn't been for a couple of weeks. They can reply STOP." },
  yits_pass_expiring: { name: "Pass expiring", when: "A class pass is about to expire." },
  yits_membership_move: { name: "Please add your card", when: "Switch-over only, same timing as the email." },
  yits_broadcast: { name: "Broadcast", when: "Only when you send one from Admin, Broadcast. They can reply STOP." },
};

type Tpl = { name: string; components: { type: string; text?: string; example?: { body_text?: string[][] }; buttons?: { text: string }[] }[] };
function fillTemplate(t: Tpl) {
  const body = t.components.find((c) => c.type === "BODY");
  const ex = body?.example?.body_text?.[0] ?? [];
  const text = (body?.text ?? "").replace(/\{\{(\d+)\}\}/g, (_, n) => ex[Number(n) - 1] ?? `{{${n}}}`);
  const buttons = t.components.find((c) => c.type === "BUTTONS")?.buttons?.map((b) => b.text) ?? [];
  return { text, buttons };
}

export default async function MessagesPage() {
  const { data: settings } = await createAdminClient().from("settings").select("club_name, whatsapp_community_url").eq("id", 1).single();
  const club = settings?.club_name ?? "Yoga in the Stars";
  const gate = await getGate().catch(() => ({ live: false, liveFrom: null, allowlist: [] as string[] }));

  return (
    <div>
      <PageHeader title="Messages" intro="Everything a member can receive from the club, word for word, and when it's sent. The examples use made-up details." />

      <div className={`mb-8 border p-4 text-sm ${gate.live ? "border-green/40 bg-green-soft" : "border-orange/40 bg-orange-soft"}`}>
        {gate.live ? (
          <p><strong>Member messages are live.</strong> These go to members as described below.</p>
        ) : (
          <p>
            <strong>Member messages are switched off.</strong> Nothing below reaches members until the go-live date is set in Settings on switch-over day.
            Until then, only the team&apos;s test addresses get them ({gate.allowlist.join(", ") || "none"}).
          </p>
        )}
      </div>

      <h2 className="text-2xl font-serif mb-1">Emails</h2>
      <p className="text-sm text-ink-soft mb-6">Sent from hello@yogainthestars.com. Replies come back to that inbox.</p>
      <div className="space-y-10">
        {EMAILS.map((g) => (
          <section key={g.group}>
            <h3 className="caps text-ink-soft mb-3">{g.group}</h3>
            <div className="space-y-4">
              {g.items.map((it) => {
                const m = memberEmail(it.type, sample, "Priya", club, settings?.whatsapp_community_url);
                if (!m) return null;
                return (
                  <details key={it.type} className="card">
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="font-semibold">{it.name}</span>
                        <span className="text-xs text-ink-soft">tap to read</span>
                      </div>
                      <p className="text-sm text-ink-soft mt-1">{it.when}</p>
                    </summary>
                    <div className="mt-4 border-t border-line pt-4">
                      <p className="text-sm"><span className="text-ink-soft">Subject:</span> <strong>{m.subject}</strong></p>
                      <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed bg-bg-soft p-4">{m.text}</pre>
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <h2 className="text-2xl font-serif mt-14 mb-1">WhatsApp</h2>
      <p className="text-sm text-ink-soft mb-6">
        From the club&apos;s second number, once it&apos;s connected. Only to people who ticked WhatsApp when they registered. WhatsApp
        only allows these approved wordings to start a conversation; after someone replies, you can chat normally.
      </p>
      <div className="space-y-4">
        {(templates.templates as Tpl[]).map((t) => {
          const { text, buttons } = fillTemplate(t);
          const meta = WHATSAPP_NAMES[t.name] ?? { name: t.name, when: "" };
          return (
            <details key={t.name} className="card">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-semibold">{meta.name}</span>
                  <span className="text-xs text-ink-soft">tap to read</span>
                </div>
                {meta.when && <p className="text-sm text-ink-soft mt-1">{meta.when}</p>}
              </summary>
              <div className="mt-4 border-t border-line pt-4">
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed bg-[#e7f6e7] p-4 max-w-md">{text}</p>
                {buttons.length > 0 && <p className="mt-2 text-xs text-ink-soft">Button: {buttons.join(", ")}</p>}
              </div>
            </details>
          );
        })}
      </div>

      <h2 className="text-2xl font-serif mt-14 mb-1">Written by you</h2>
      <p className="text-sm text-ink-soft mb-10">
        Broadcasts (Admin, Broadcast) are only ever sent when you write and send one, to the group you choose.
      </p>
    </div>
  );
}
