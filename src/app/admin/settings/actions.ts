"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient, requireRole } from "@/lib/supabase/server";

export async function saveSettings(formData: FormData) {
  await requireRole("admin");
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const num = (k: string, d: number) => { const v = Number(str(k)); return Number.isFinite(v) ? v : d; };
  await createAdminClient()
    .from("settings")
    .update({
      club_name: str("club_name") || "Yoga in the Stars",
      contact_whatsapp: str("contact_whatsapp") || null,
      contact_email: str("contact_email") || null,
      address_line: str("address_line") || "Upstairs The Heathcote and Star, 344 Grove Green Road, E11 4EA",
      promo_text: str("promo_text") || null,
      promo_url: str("promo_url") || "/membership",
      instagram_url: str("instagram_url") || null,
      facebook_url: str("facebook_url") || null,
      youtube_url: str("youtube_url") || null,
      whatsapp_community_url: str("whatsapp_community_url") || null,
      whatsapp_team_numbers: str("whatsapp_team_numbers").split(",").map((s) => s.trim()).filter(Boolean),
      booking_cutoff_minutes: num("booking_cutoff_minutes", 0),
      cancel_cutoff_hours: num("cancel_cutoff_hours", 2),
      orange_after_days: num("orange_after_days", 10),
      red_after_days: num("red_after_days", 21),
    })
    .eq("id", 1);
  revalidatePath("/", "layout");
  redirect("/admin/settings?msg=" + encodeURIComponent("Saved."));
}
