import { createAdminClient } from "@/lib/supabase/server";
import { getEngagement } from "@/lib/admin";
import { fmtDateTime } from "@/lib/format";
import { PageHeader, Notice } from "@/components/ui";
import { sendBroadcast } from "./actions";

export const metadata = { title: "Broadcast" };

export default async function BroadcastPage({ searchParams }: PageProps<"/admin/broadcast">) {
  const sp = await searchParams;
  const db = createAdminClient();
  const [engagement, { data: sessions }, { data: history }] = await Promise.all([
    getEngagement(),
    db.from("class_sessions").select("id, starts_at, class_types(name)").gte("starts_at", new Date().toISOString()).order("starts_at").limit(30),
    db.from("broadcasts").select("*, profiles(full_name)").order("created_at", { ascending: false }).limit(10),
  ]);
  const members = engagement.filter((e) => e.is_member).length;
  const atRisk = engagement.filter((e) => e.flag === "orange" || e.flag === "red").length;
  const msg = typeof sp.msg === "string" ? sp.msg : null;

  return (
    <div className="space-y-8">
      <PageHeader title="Broadcast" intro="Message a group in one go. No more copying email addresses out of Momo." />
      {msg && <Notice kind={msg.startsWith("✓") ? "success" : "error"}>{msg}</Notice>}

      <form action={sendBroadcast} className="card space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">Who</label>
            <select name="audience" className="input">
              <option value="members">All members ({members})</option>
              <option value="at_risk">Orange and red members ({atRisk})</option>
              <option value="everyone">Everyone ({engagement.length})</option>
              <option value="non_members">Not members ({engagement.length - members})</option>
              {(sessions ?? []).map((s) => (
                <option key={s.id} value={`session:${s.id}`}>Booked on {s.class_types.name} · {fmtDateTime(s.starts_at)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Channel</label>
            <select name="channel" className="input">
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp (only people who opted in)</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Subject (email only)</label>
          <input name="subject" className="input" placeholder="This Sunday: restorative + live cello" />
        </div>
        <div>
          <label className="label">Message</label>
          <textarea name="body" rows={6} className="input" required placeholder={"Hi {{first_name}},\n\n..."} />
          <p className="text-xs text-ink-soft mt-1">Use {"{{first_name}}"} to personalise. WhatsApp messages are sent through n8n from the club number.</p>
        </div>
        <button className="btn-primary">Send</button>
      </form>

      <section className="card">
        <h2 className="font-semibold text-brand mb-2">Recent broadcasts</h2>
        <ul className="divide-y divide-line text-sm">
          {(history ?? []).map((b) => (
            <li key={b.id} className="py-2 flex justify-between gap-3">
              <span className="truncate">{b.subject || b.body.slice(0, 60)} <span className="text-ink-soft">· {b.channel} · {b.recipient_count} people</span></span>
              <span className="text-ink-soft shrink-0">{fmtDateTime(b.created_at)}</span>
            </li>
          ))}
          {(history ?? []).length === 0 && <li className="py-2 text-ink-soft">Nothing sent yet.</li>}
        </ul>
      </section>
    </div>
  );
}
