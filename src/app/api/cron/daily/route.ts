import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { emit } from "@/lib/outbox";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorised(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}` || req.nextUrl.searchParams.get("secret") === secret;
}

/**
 * Once a day (Vercel cron, 08:00 London):
 *  1. class reminders for tomorrow's bookings
 *  2. engagement flag changes (green -> orange -> red) so n8n can nudge people
 *  3. class pass expiry warnings
 *  4. mark past sessions completed and no-shows
 */
export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const db = createAdminClient();
  const now = new Date();

  // 1. reminders for classes in the next 24-48h window (runs daily so this catches "tomorrow")
  const from = new Date(now.getTime() + 20 * 3600_000).toISOString();
  const to = new Date(now.getTime() + 44 * 3600_000).toISOString();
  const { data: upcoming } = await db
    .from("bookings")
    .select("id, user_id, class_sessions!inner(id, starts_at, class_types(name), teacher:profiles!class_sessions_teacher_id_fkey(full_name))")
    .eq("status", "booked")
    .gte("class_sessions.starts_at", from)
    .lte("class_sessions.starts_at", to);
  let reminders = 0;
  for (const b of upcoming ?? []) {
    const s = b.class_sessions as unknown as { id: string; starts_at: string; class_types: { name: string }; teacher: { full_name: string } | null };
    await emit("booking.reminder", b.user_id, { booking_id: b.id, session_id: s.id, class_name: s.class_types.name, starts_at: s.starts_at, teacher: s.teacher?.full_name ?? null });
    reminders++;
  }

  // 2. engagement flags: compare today's flag with the last one we emitted
  const { data: eng } = await db.from("engagement").select("user_id, full_name, flag, last_attended_at, is_member");
  const { data: lastFlags } = await db
    .from("outbox_events")
    .select("user_id, payload, created_at")
    .eq("type", "engagement.flag_changed")
    .order("created_at", { ascending: false })
    .limit(2000);
  const lastByUser = new Map<string, string>();
  for (const e of lastFlags ?? []) {
    if (e.user_id && !lastByUser.has(e.user_id)) lastByUser.set(e.user_id, (e.payload as { to?: string })?.to ?? "");
  }
  let flagChanges = 0;
  for (const r of eng ?? []) {
    if (!r.is_member || !r.user_id) continue;
    const prev = lastByUser.get(r.user_id) ?? "green";
    if ((r.flag === "orange" || r.flag === "red") && r.flag !== prev) {
      await emit("engagement.flag_changed", r.user_id, { from: prev, to: r.flag, last_attended_at: r.last_attended_at, name: r.full_name });
      flagChanges++;
    } else if (r.flag === "green" && (prev === "orange" || prev === "red")) {
      await emit("engagement.flag_changed", r.user_id, { from: prev, to: "green", last_attended_at: r.last_attended_at, name: r.full_name });
      flagChanges++;
    }
  }

  // 3. class passes expiring within 7 days that still have credits
  const soon = new Date(now.getTime() + 7 * 86400_000).toISOString();
  const { data: expiring } = await db
    .from("class_passes")
    .select("id, user_id, credits_remaining, expires_at")
    .gt("credits_remaining", 0)
    .gt("expires_at", now.toISOString())
    .lte("expires_at", soon);
  const { data: alreadyWarned } = await db.from("outbox_events").select("payload").eq("type", "class_pass.expiring").gte("created_at", new Date(now.getTime() - 8 * 86400_000).toISOString());
  const warned = new Set((alreadyWarned ?? []).map((e) => (e.payload as { pass_id?: string })?.pass_id));
  let expiryWarnings = 0;
  for (const p of expiring ?? []) {
    if (warned.has(p.id)) continue;
    await emit("class_pass.expiring", p.user_id, { pass_id: p.id, credits_remaining: p.credits_remaining, expires_at: p.expires_at });
    expiryWarnings++;
  }

  // 4. tidy up: sessions that finished -> completed; bookings never checked in -> stay 'booked' (counts as attended for engagement)
  await db.from("class_sessions").update({ status: "completed" }).eq("status", "scheduled").lt("ends_at", new Date(now.getTime() - 3600_000).toISOString());

  return NextResponse.json({ reminders, flagChanges, expiryWarnings });
}
