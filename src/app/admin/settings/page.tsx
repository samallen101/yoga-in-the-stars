import { createAdminClient } from "@/lib/supabase/server";
import { PageHeader, Notice } from "@/components/ui";
import { saveSettings } from "./actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const sp = await searchParams;
  const { data: s } = await createAdminClient().from("settings").select("*").eq("id", 1).single();
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const liveFrom = s?.member_messages_live_from ?? null;
  const liveNow = !!liveFrom && Date.parse(liveFrom) <= Date.now();
  const liveDay = liveFrom ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(liveFrom)) : "";
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Settings" />
      {msg && <Notice kind="success">{msg}</Notice>}
      <form action={saveSettings} className="card space-y-4">
        <div><label className="label">Club name</label><input name="club_name" defaultValue={s?.club_name} className="input" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Public WhatsApp number</label><input name="contact_whatsapp" defaultValue={s?.contact_whatsapp ?? ""} className="input" placeholder="+447..." /></div>
          <div><label className="label">Public email</label><input name="contact_email" defaultValue={s?.contact_email ?? ""} className="input" placeholder="hello@..." /></div>
        </div>
        <div><label className="label">Address (shown on the homepage and contact page)</label><input name="address_line" defaultValue={s?.address_line ?? ""} className="input" /></div>
        <div>
          <label className="label">Promo bar text (blank to hide)</label>
          <textarea name="promo_text" rows={2} defaultValue={s?.promo_text ?? ""} className="input" />
        </div>
        <div><label className="label">Promo bar link</label><input name="promo_url" defaultValue={s?.promo_url ?? "/membership"} className="input" /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Instagram</label><input name="instagram_url" defaultValue={s?.instagram_url ?? ""} className="input" /></div>
          <div><label className="label">Facebook</label><input name="facebook_url" defaultValue={s?.facebook_url ?? ""} className="input" /></div>
          <div><label className="label">YouTube</label><input name="youtube_url" defaultValue={s?.youtube_url ?? ""} className="input" /></div>
        </div>
        <div>
          <label className="label">Members' WhatsApp community invite link</label>
          <input name="whatsapp_community_url" defaultValue={s?.whatsapp_community_url ?? ""} className="input" placeholder="https://chat.whatsapp.com/..." />
          <p className="text-xs text-ink-soft mt-1">Shown to members in My club and sent in the welcome message.</p>
        </div>
        <div>
          <label className="label">Team WhatsApp numbers (comma separated, international format)</label>
          <input name="whatsapp_team_numbers" defaultValue={(s?.whatsapp_team_numbers ?? []).join(", ")} className="input" placeholder="+447..., +447..." />
          <p className="text-xs text-ink-soft mt-1">n8n pings these numbers when someone joins, a payment fails, or a class is cancelled.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Booking closes (minutes before)</label><input name="booking_cutoff_minutes" type="number" defaultValue={s?.booking_cutoff_minutes} className="input" /></div>
          <div><label className="label">Free cancellation (hours before)</label><input name="cancel_cutoff_hours" type="number" defaultValue={s?.cancel_cutoff_hours} className="input" /></div>
          <div><label className="label">Orange flag after (days without a class)</label><input name="orange_after_days" type="number" defaultValue={s?.orange_after_days} className="input" /></div>
          <div><label className="label">Red flag after (days)</label><input name="red_after_days" type="number" defaultValue={s?.red_after_days} className="input" /></div>
        </div>
        <div className="rounded-lg border border-brand p-4 space-y-3">
          <p className="font-medium">Member messages: {liveNow ? "LIVE" : "held (test only)"}</p>
          <p className="text-xs text-ink-soft">Until the go-live date, emails and WhatsApp only reach the test addresses below. Everything else is dropped and logged, never queued, so switching on can&apos;t release a backlog. Leave the date blank to keep messages held. Set it only on switch-over day, once Momo renewals are stopped.</p>
          <div><label className="label">Member messages live from (London, midnight)</label><input name="member_messages_live_from" type="date" defaultValue={liveDay} className="input" /></div>
          <div>
            <label className="label">Test addresses (always allowed; comma or new line separated)</label>
            <textarea name="message_test_allowlist" rows={3} defaultValue={(s?.message_test_allowlist ?? []).join("\n")} className="input" />
          </div>
        </div>
        <button className="btn-primary">Save settings</button>
      </form>
    </div>
  );
}
