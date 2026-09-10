"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient, requireRole } from "@/lib/supabase/server";
import { emit } from "@/lib/outbox";

function back(id: string, msg: string): never {
  revalidatePath(`/admin/people/${id}`);
  redirect(`/admin/people/${id}?msg=${encodeURIComponent(msg)}`);
}

export async function saveNotes(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("user_id"));
  await createAdminClient().from("profiles").update({ notes: String(formData.get("notes") ?? "") }).eq("id", id);
  back(id, "✓ Notes saved.");
}

export async function setRole(formData: FormData) {
  const me = await requireRole("admin");
  const id = String(formData.get("user_id"));
  const role = String(formData.get("role")) as "yogi" | "teacher" | "admin";
  if (id === me.user.id && role !== "admin") back(id, "You can't remove your own admin role.");
  await createAdminClient().from("profiles").update({ role }).eq("id", id);
  back(id, `✓ Role set to ${role}.`);
}

export async function grantClassPass(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("user_id"));
  const db = createAdminClient();
  const { data: product } = await db.from("class_pass_products").select("*").eq("id", String(formData.get("product_id"))).single();
  if (!product) back(id, "Pass not found.");
  const expires = new Date(Date.now() + product.validity_days * 86400_000).toISOString();
  await db.from("class_passes").insert({ user_id: id, product_id: product.id, credits_total: product.credits, credits_remaining: product.credits, expires_at: expires });
  await emit("class_pass.granted", id, { product: product.name, credits: product.credits, expires_at: expires });
  back(id, `✓ Granted ${product.name}.`);
}

export async function grantMembership(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("user_id"));
  const days = Math.max(1, Number(formData.get("days") ?? 30));
  const db = createAdminClient();
  const { data: plan } = await db.from("membership_plans").select("*").eq("id", String(formData.get("plan_id"))).single();
  if (!plan) back(id, "Plan not found.");
  const end = new Date(Date.now() + days * 86400_000).toISOString();
  await db.from("memberships").insert({
    user_id: id,
    plan_id: plan.id,
    status: "active",
    current_period_start: new Date().toISOString(),
    current_period_end: end,
    cancel_at: end,
  });
  await emit("membership.granted", id, { plan: plan.name, days, period_end: end });
  back(id, `✓ ${plan.name} granted for ${days} days.`);
}
