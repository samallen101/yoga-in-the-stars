"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fromZonedTime } from "date-fns-tz";
import { createAdminClient, requireRole } from "@/lib/supabase/server";
import { TZ } from "@/lib/format";

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
