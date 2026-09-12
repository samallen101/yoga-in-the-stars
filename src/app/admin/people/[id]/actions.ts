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

// ---------------------------------------------------------------------------
// Fix-it tools: the things that go wrong in real life, fixable in one click
// without anyone touching the database.
// ---------------------------------------------------------------------------

/** Add or remove credits on a pass, and/or move its expiry. */
export async function adjustPass(formData: FormData) {
  const me = await requireRole("admin");
  const id = String(formData.get("user_id"));
  const passId = String(formData.get("pass_id"));
  const delta = Number(formData.get("delta") ?? 0);
  const expires = String(formData.get("expires_at") ?? "");
  const db = createAdminClient();
  const { data: pass } = await db.from("class_passes").select("*").eq("id", passId).eq("user_id", id).single();
  if (!pass) back(id, "Pass not found.");
  const patch: { credits_remaining?: number; credits_total?: number; expires_at?: string } = {};
  if (delta) {
    patch.credits_remaining = Math.max(0, pass.credits_remaining + delta);
    if (patch.credits_remaining > pass.credits_total) patch.credits_total = patch.credits_remaining;
  }
  if (expires) patch.expires_at = new Date(expires + "T23:59:59").toISOString();
  if (!Object.keys(patch).length) back(id, "Nothing to change.");
  await db.from("class_passes").update(patch).eq("id", passId);
  await emit("class_pass.adjusted", id, { pass_id: passId, delta, expires_at: patch.expires_at ?? pass.expires_at, by: me.user.id });
  back(id, `✓ Pass updated${delta ? ` (${delta > 0 ? "+" : ""}${delta} credits)` : ""}${expires ? `, expires ${expires}` : ""}.`);
}

/** Extend a membership's current period by N days, or end it now. */
export async function adjustMembership(formData: FormData) {
  const me = await requireRole("admin");
  const id = String(formData.get("user_id"));
  const mId = String(formData.get("membership_id"));
  const action = String(formData.get("action"));
  const db = createAdminClient();
  const { data: m } = await db.from("memberships").select("*, membership_plans(name)").eq("id", mId).eq("user_id", id).single();
  if (!m) back(id, "Membership not found.");
  if (action === "end") {
    await db.from("memberships").update({ status: "cancelled", ended_at: new Date().toISOString(), current_period_end: new Date().toISOString() }).eq("id", mId);
    await emit("membership.ended_by_staff", id, { membership_id: mId, plan: m.membership_plans?.name, by: me.user.id });
    back(id, `✓ ${m.membership_plans?.name} ended.`);
  }
  const days = Math.max(1, Number(formData.get("days") ?? 30));
  const base = m.current_period_end && new Date(m.current_period_end) > new Date() ? new Date(m.current_period_end) : new Date();
  const end = new Date(base.getTime() + days * 86400_000).toISOString();
  await db.from("memberships").update({ status: "active", current_period_end: end, ended_at: null }).eq("id", mId);
  await emit("membership.extended", id, { membership_id: mId, plan: m.membership_plans?.name, days, period_end: end, by: me.user.id });
  back(id, `✓ ${m.membership_plans?.name} extended by ${days} days.`);
}

/** Cancel a booking on the member's behalf. Staff cancellations always return the credit. */
export async function staffCancelBooking(formData: FormData) {
  const me = await requireRole("admin");
  const id = String(formData.get("user_id"));
  const { cancelBooking } = await import("@/lib/booking");
  const r = await cancelBooking(me.user.id, String(formData.get("booking_id")), true);
  back(id, r.ok ? "✓ Booking cancelled and any credit returned." : r.error ?? "Could not cancel.");
}

/** Put someone on a class for free (a comp), skipping payment and credits. */
export async function compBooking(formData: FormData) {
  const me = await requireRole("admin");
  const id = String(formData.get("user_id"));
  const { getSession, createBooking } = await import("@/lib/booking");
  const session = await getSession(String(formData.get("session_id")));
  if (!session) back(id, "Class not found.");
  const r = await createBooking({ userId: id, session, paidWith: "comp" });
  if (r.ok) await emit("booking.comped", id, { session_id: session.id, class_name: session.class_types.name, starts_at: session.starts_at, by: me.user.id });
  back(id, r.ok ? `✓ Booked on ${session.class_types.name} as a comp.` : r.error ?? "Could not book.");
}

/** Record money taken outside the site (cash, bank transfer) so the ledger is complete. */
export async function recordPayment(formData: FormData) {
  const me = await requireRole("admin");
  const id = String(formData.get("user_id"));
  const pounds = Number(formData.get("amount") ?? 0);
  const description = String(formData.get("description") ?? "").trim() || "Payment taken in person";
  const method = String(formData.get("method") ?? "cash");
  if (!(pounds > 0)) back(id, "Enter an amount.");
  const db = createAdminClient();
  await db.from("orders").insert({
    user_id: id, kind: "donation", amount_pence: Math.round(pounds * 100), status: "paid", paid_at: new Date().toISOString(),
    description: `${description} (${method})`, metadata: { method, recorded_by: me.user.id, manual: true },
  });
  await emit("payment.recorded", id, { amount_pence: Math.round(pounds * 100), description, method, by: me.user.id });
  back(id, `✓ Recorded £${pounds.toFixed(2)} (${method}). Grant the pass or membership above if it comes with one.`);
}
