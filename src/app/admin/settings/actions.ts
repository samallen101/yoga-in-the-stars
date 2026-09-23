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
      member_messages_live_from: londonMidnight(str("member_messages_live_from")),
      message_test_allowlist: str("message_test_allowlist").split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter((s) => s.includes("@")),
    })
    .eq("id", 1);
  revalidatePath("/", "layout");
  redirect("/admin/settings?msg=" + encodeURIComponent("Saved."));
}

/** "2026-10-12" -> that day's midnight in London as an ISO timestamp; blank -> null (messages held). */
function londonMidnight(day: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const londonHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", hourCycle: "h23" }).format(new Date(utc)));
  return new Date(utc - londonHour * 3600_000).toISOString();
}
