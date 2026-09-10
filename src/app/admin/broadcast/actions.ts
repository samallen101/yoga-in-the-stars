"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient, requireRole } from "@/lib/supabase/server";
import { getEngagement } from "@/lib/admin";
import { emit } from "@/lib/outbox";
import { sendEmail } from "@/lib/email";

function back(msg: string): never {
  revalidatePath("/admin/broadcast");
  redirect(`/admin/broadcast?msg=${encodeURIComponent(msg)}`);
}

export async function sendBroadcast(formData: FormData) {
  const me = await requireRole("admin");
  const db = createAdminClient();
  const audience = String(formData.get("audience") ?? "members");
  const channel = String(formData.get("channel") ?? "email") as "email" | "whatsapp";
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) back("Write a message first.");

  let recipients: { id: string; email: string | null; full_name: string | null; phone: string | null; whatsapp_opt_in: boolean | null }[] = [];

  if (audience.startsWith("session:")) {
    const { data } = await db
      .from("bookings")
      .select("profiles(id, email, full_name, phone, whatsapp_opt_in)")
      .eq("session_id", audience.slice(8))
      .in("status", ["booked", "waitlisted", "attended"]);
    recipients = (data ?? []).map((b) => b.profiles).filter(Boolean) as typeof recipients;
  } else {
    const eng = await getEngagement();
    const rows =
      audience === "members" ? eng.filter((e) => e.is_member)
      : audience === "at_risk" ? eng.filter((e) => e.flag === "orange" || e.flag === "red")
      : audience === "non_members" ? eng.filter((e) => !e.is_member)
      : eng;
    recipients = rows.map((r) => ({ id: r.user_id!, email: r.email, full_name: r.full_name, phone: r.phone, whatsapp_opt_in: r.whatsapp_opt_in }));
  }

  if (channel === "whatsapp") recipients = recipients.filter((r) => r.whatsapp_opt_in && r.phone);
  if (recipients.length === 0) back("Nobody matches that audience on that channel.");

  const personalise = (text: string, r: { full_name: string | null }) => text.replace(/\{\{\s*first_name\s*\}\}/g, (r.full_name ?? "there").split(" ")[0]);

  if (channel === "email") {
    for (const r of recipients) {
      if (!r.email) continue;
      await sendEmail({ to: r.email, subject: subject || "A message from Yoga in the Stars", text: personalise(body, r) });
    }
  } else {
    // n8n does the sending from the club WhatsApp number; one event per person keeps retries simple.
    for (const r of recipients) {
      await emit("broadcast.whatsapp", r.id, { phone: r.phone, message: personalise(body, r), audience });
    }
  }

  await db.from("broadcasts").insert({
    created_by: me.user.id,
    channel,
    audience: { audience },
    subject: subject || null,
    body,
    recipient_count: recipients.length,
    sent_at: new Date().toISOString(),
  });
  await emit("broadcast.sent", me.user.id, { channel, audience, recipient_count: recipients.length, subject });
  back(`✓ ${channel === "email" ? "Emailed" : "Queued WhatsApp for"} ${recipients.length} ${recipients.length === 1 ? "person" : "people"}.`);
}
