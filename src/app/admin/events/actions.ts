"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fromZonedTime } from "date-fns-tz";
import { createAdminClient, requireRole } from "@/lib/supabase/server";
import { TZ } from "@/lib/format";

function back(msg: string): never {
  revalidatePath("/admin/events");
  revalidatePath("/events");
  redirect(`/admin/events?msg=${encodeURIComponent(msg)}`);
}
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => { const v = str(fd, k); return v === "" ? null : Number(v); };
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export async function saveEvent(formData: FormData) {
  await requireRole("admin");
  const title = str(formData, "title");
  const starts = fromZonedTime(str(formData, "starts_at"), TZ);
  const endsRaw = str(formData, "ends_at");
  if (isNaN(starts.getTime())) back("Invalid start time.");
  const base = slugify(title) || "event";
  const slug = `${base}-${starts.toISOString().slice(0, 10)}`;
  const { error } = await createAdminClient().from("events").insert({
    title,
    slug,
    description: str(formData, "description") || null,
    starts_at: starts.toISOString(),
    ends_at: endsRaw ? fromZonedTime(endsRaw, TZ).toISOString() : null,
    location_id: str(formData, "location_id") || null,
    image_url: str(formData, "image_url") || null,
  });
  back(error ? error.message : "✓ Event created as a draft. Add tickets, then publish.");
}

export async function saveTicket(formData: FormData) {
  await requireRole("admin");
  const memberPrice = num(formData, "member_price");
  const { error } = await createAdminClient().from("event_tickets").insert({
    event_id: str(formData, "event_id"),
    name: str(formData, "name"),
    price_pence: Math.round((num(formData, "price") ?? 0) * 100),
    member_price_pence: memberPrice == null ? null : Math.round(memberPrice * 100),
    members_only: formData.get("members_only") === "on",
    quantity: num(formData, "quantity"),
  });
  back(error ? error.message : "✓ Ticket added.");
}

export async function setEventStatus(formData: FormData) {
  await requireRole("admin");
  const status = str(formData, "status") as "draft" | "published" | "cancelled" | "completed";
  await createAdminClient().from("events").update({ status }).eq("id", str(formData, "id"));
  back(`✓ Event ${status}.`);
}
