"use server";

import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/stripe";

function safeNext(v: FormDataEntryValue | null) {
  const s = typeof v === "string" ? v : "/me";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/me";
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const next = safeNext(formData.get("next"));
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });
  if (error) redirect(`/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent("Email or password didn't match.")}`);
  redirect(next);
}

export async function sendMagicLink(formData: FormData) {
  const supabase = await createClient();
  const next = safeNext(formData.get("next"));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect(`/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent("Enter your email first.")}`);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: siteUrl(`/auth/callback?next=${encodeURIComponent(next)}`) },
  });
  if (error) redirect(`/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent(error.message)}`);
  redirect(`/login?next=${encodeURIComponent(next)}&sent=1`);
}

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const next = safeNext(formData.get("next"));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const full_name = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const whatsapp_opt_in = formData.get("whatsapp_opt_in") === "on";

  const { data, error } = await supabase.auth.signUp({
    email,
    password: String(formData.get("password") ?? ""),
    options: {
      data: { full_name, phone },
      emailRedirectTo: siteUrl(`/auth/callback?next=${encodeURIComponent(next)}`),
    },
  });
  if (error) redirect(`/register?next=${encodeURIComponent(next)}&error=${encodeURIComponent(error.message)}`);

  if (data.user) {
    const admin = createAdminClient();
    await admin.from("profiles").update({ full_name, phone, whatsapp_opt_in }).eq("id", data.user.id);
    await admin.rpc("emit_event", {
      p_type: "user.registered",
      p_user_id: data.user.id,
      p_payload: { email, full_name, phone, whatsapp_opt_in },
    });
  }

  // If email confirmation is on, there is no session yet.
  if (!data.session) redirect(`/register?next=${encodeURIComponent(next)}&check=1`);
  redirect(next);
}
