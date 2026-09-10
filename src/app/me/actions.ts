"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient, getCurrentUser } from "@/lib/supabase/server";

export async function updateProfile(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/me");
  await createAdminClient()
    .from("profiles")
    .update({
      full_name: String(formData.get("full_name") ?? "").trim() || me.profile.full_name,
      phone: String(formData.get("phone") ?? "").trim() || null,
      whatsapp_opt_in: formData.get("whatsapp_opt_in") === "on",
    })
    .eq("id", me.user.id);
  revalidatePath("/me");
  redirect("/me?saved=1");
}
