"use server";

import { redirect } from "next/navigation";
import { createAdminClient, getCurrentUser } from "@/lib/supabase/server";
import { checkoutForPlan, checkoutForClassPass, portalUrl } from "@/lib/checkout";

export async function startPlanCheckout(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) redirect("/register?next=/membership");
  const db = createAdminClient();
  const { data: plan } = await db.from("membership_plans").select("*").eq("id", String(formData.get("plan_id"))).eq("active", true).single();
  if (!plan) redirect("/membership?msg=" + encodeURIComponent("That plan isn't available."));
  const { data: already } = await db.rpc("is_active_member", { uid: me.user.id });
  if (already) redirect("/me");
  const url = await checkoutForPlan(me.profile, plan);
  redirect(url);
}

export async function startPassCheckout(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) redirect("/register?next=/membership");
  const db = createAdminClient();
  const { data: product } = await db.from("class_pass_products").select("*").eq("id", String(formData.get("product_id"))).eq("active", true).single();
  if (!product) redirect("/membership?msg=" + encodeURIComponent("That pass isn't available."));
  const url = await checkoutForClassPass(me.profile, product);
  redirect(url);
}

export async function openBillingPortal() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/me");
  redirect(await portalUrl(me.profile));
}
