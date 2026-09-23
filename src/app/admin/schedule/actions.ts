"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fromZonedTime } from "date-fns-tz";
import { createAdminClient, requireRole } from "@/lib/supabase/server";
import { TZ } from "@/lib/format";
import { emit } from "@/lib/outbox";

function back(msg: string): never {
  revalidatePath("/admin/schedule");
  revalidatePath("/schedule");
  revalidatePath("/");
  redirect(`/admin/schedule?msg=${encodeURIComponent(msg)}`);
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => { const v = str(fd, k); return v === "" ? null : Number(v); };

export async function saveClassType(formData: FormData) {
  await requireRole("admin");
  const { error } = await createAdminClient().from("class_types").insert({
    name: str(formData, "name"),
    description: str(formData, "description") || null,
    duration_minutes: num(formData, "duration_minutes") ?? 60,
    default_capacity: num(formData, "default_capacity") ?? 16,
    colour: str(formData, "colour") || "#7c6f9f",
    default_pricing: (str(formData, "default_pricing") || "members_included") as "members_included" | "drop_in" | "pay_what_you_wish" | "free",
    default_drop_in_pence: Math.round((num(formData, "default_drop_in") ?? 12) * 100),
  });
  back(error ? error.message : "✓ Class type saved.");
}

export async function saveLocation(formData: FormData) {
  await requireRole("admin");
  await createAdminClient().from("locations").insert({ name: str(formData, "name") });
  back("✓ Location added.");
}

export async function createSessions(formData: FormData) {
  await requireRole("admin");
  const db = createAdminClient();
  const { data: type } = await db.from("class_types").select("*").eq("id", str(formData, "class_type_id")).single();
  if (!type) back("Class type not found.");

  const date = str(formData, "date");
  const time = str(formData, "time");
  const weeks = Math.max(1, num(formData, "weeks") ?? 1);
  const first = fromZonedTime(`${date}T${time}:00`, TZ);
  if (isNaN(first.getTime())) back("Invalid date or time.");

  const pricing = (str(formData, "pricing") || type.default_pricing) as typeof type.default_pricing;
  const dropIn = num(formData, "drop_in");
  const rows = Array.from({ length: weeks }, (_, i) => {
    const starts = new Date(first.getTime() + i * 7 * 86400_000);
    return {
      class_type_id: type.id,
      teacher_id: str(formData, "teacher_id") || null,
      location_id: str(formData, "location_id") || null,
      starts_at: starts.toISOString(),
      ends_at: new Date(starts.getTime() + type.duration_minutes * 60_000).toISOString(),
      capacity: num(formData, "capacity") ?? type.default_capacity,
      pricing,
      drop_in_pence: dropIn != null ? Math.round(dropIn * 100) : type.default_drop_in_pence,
    };
  });
  const { error } = await db.from("class_sessions").insert(rows);
  back(error ? error.message : `✓ Added ${rows.length} session${rows.length === 1 ? "" : "s"} of ${type.name}.`);
}

export async function deleteSession(formData: FormData) {
  await requireRole("admin");
  const { error } = await createAdminClient().from("class_sessions").delete().eq("id", str(formData, "id"));
  back(error ? error.message : "✓ Session deleted.");
}

/**
 * Change a session after it's been created: substitute teacher, new time (the
 * pub has taken the room), or capacity. If the time moves, everyone booked or
 * waitlisted is told (session.moved; email via the site, WhatsApp via n8n, both
 * behind the launch gate). Bookings stay attached, so they follow the new time.
 */
export async function updateSession(formData: FormData) {
  const me = await requireRole("admin");
  const db = createAdminClient();
  const id = str(formData, "id");
  const { data: s } = await db.from("class_sessions").select("*, class_types(name)").eq("id", id).single();
  if (!s) back("Session not found.");

  const date = str(formData, "date");
  const time = str(formData, "time");
  const newStart = date && time ? fromZonedTime(`${date}T${time}:00`, TZ) : new Date(s.starts_at);
  if (isNaN(newStart.getTime())) back("Invalid date or time.");
  const moved = newStart.getTime() !== Date.parse(s.starts_at);
  const duration = Date.parse(s.ends_at) - Date.parse(s.starts_at);
  const capacity = num(formData, "capacity") ?? s.capacity;
  const teacherId = str(formData, "teacher_id") || null;

  const { error } = await db
    .from("class_sessions")
    .update({
      teacher_id: teacherId,
      capacity,
      starts_at: newStart.toISOString(),
      ends_at: new Date(newStart.getTime() + duration).toISOString(),
    })
    .eq("id", id);
  if (error) back(error.message);

  const changes: string[] = [];
  if (teacherId !== s.teacher_id) changes.push("teacher");
  if (capacity !== s.capacity) changes.push("capacity");
  let told = 0;
  if (moved) {
    changes.push("time");
    const { data: bookings } = await db
      .from("bookings")
      .select("user_id, status, profiles(full_name, email, phone, whatsapp_opt_in)")
      .eq("session_id", id)
      .in("status", ["booked", "waitlisted"]);
    const affected = (bookings ?? []).map((b) => {
      const p = b.profiles as unknown as { full_name: string | null; email: string | null; phone: string | null; whatsapp_opt_in: boolean } | null;
      return { user_id: b.user_id, status: b.status, full_name: p?.full_name ?? null, email: p?.email ?? null, phone: p?.phone ?? null, whatsapp_opt_in: p?.whatsapp_opt_in ?? false };
    });
    told = affected.length;
    await emit("session.moved", me.user.id, {
      session_id: id,
      class_name: (s.class_types as unknown as { name: string }).name,
      from: s.starts_at,
      starts_at: newStart.toISOString(),
      reason: str(formData, "reason") || null,
      affected_user_ids: affected.map((a) => a.user_id),
      affected,
    });
  }
  back(changes.length ? `✓ Updated ${changes.join(", ")}.${moved ? ` ${told} booked or waitlisted ${told === 1 ? "person" : "people"} will be told about the new time.` : ""}` : "Nothing changed.");
}
