"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient, requireRole } from "@/lib/supabase/server";

function back(msg: string): never {
  revalidatePath("/admin/plans");
  revalidatePath("/membership");
  redirect(`/admin/plans?msg=${encodeURIComponent(msg)}`);
}
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => { const v = str(fd, k); return v === "" ? null : Number(v); };

export async function savePlan(formData: FormData) {
  await requireRole("admin");
  const { error } = await createAdminClient().from("membership_plans").insert({
    name: str(formData, "name"),
    description: str(formData, "description") || null,
    price_pence: Math.round((num(formData, "price") ?? 0) * 100),
    interval: str(formData, "interval") || "month",
    classes_per_period: num(formData, "classes_per_period"),
    event_discount_percent: num(formData, "event_discount_percent") ?? 0,
  });
  back(error ? error.message : "✓ Plan created.");
}

export async function savePass(formData: FormData) {
  await requireRole("admin");
  const { error } = await createAdminClient().from("class_pass_products").insert({
    name: str(formData, "name"),
    credits: num(formData, "credits") ?? 5,
    price_pence: Math.round((num(formData, "price") ?? 0) * 100),
    validity_days: num(formData, "validity_days") ?? 90,
  });
  back(error ? error.message : "✓ Pass created.");
}

export async function toggleActive(formData: FormData) {
  await requireRole("admin");
  const table = str(formData, "table") as "membership_plans" | "class_pass_products";
  if (!["membership_plans", "class_pass_products"].includes(table)) back("Bad request.");
  await createAdminClient().from(table).update({ active: str(formData, "active") === "1" }).eq("id", str(formData, "id"));
  back("✓ Updated.");
}
