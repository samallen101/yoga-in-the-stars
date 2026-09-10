import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";
import { emit } from "@/lib/outbox";

export type Session = Tables<"class_sessions"> & {
  class_types: Tables<"class_types">;
  teacher: Pick<Tables<"profiles">, "id" | "full_name"> | null;
  locations: Tables<"locations"> | null;
  booked: number;
  waitlisted: number;
};

export type Entitlement =
  | { kind: "membership"; membershipId: string; label: string }
  | { kind: "class_pass"; classPassId: string; remaining: number; label: string }
  | { kind: "free"; label: string }
  | { kind: "drop_in"; pricePence: number; label: string }
  | { kind: "pay_what_you_wish"; suggestedPence: number; label: string }
  | { kind: "blocked"; reason: string };

export async function getSession(id: string): Promise<Session | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("class_sessions")
    .select("*, class_types(*), teacher:profiles!class_sessions_teacher_id_fkey(id, full_name), locations(*)")
    .eq("id", id)
    .single();
  if (!data) return null;
  const { data: counts } = await db.from("session_booking_counts").select("*").eq("session_id", id).single();
  return {
    ...(data as unknown as Omit<Session, "booked" | "waitlisted">),
    booked: Number(counts?.booked ?? 0),
    waitlisted: Number(counts?.waitlisted ?? 0),
  };
}

export async function listUpcomingSessions(days = 14) {
  const db = createAdminClient();
  const from = new Date();
  const to = new Date(Date.now() + days * 86400_000);
  const { data } = await db
    .from("class_sessions")
    .select("*, class_types(*), teacher:profiles!class_sessions_teacher_id_fkey(id, full_name), locations(*)")
    .gte("starts_at", from.toISOString())
    .lte("starts_at", to.toISOString())
    .order("starts_at");
  const ids = (data ?? []).map((s) => s.id);
  const { data: counts } = ids.length
    ? await db.from("session_booking_counts").select("*").in("session_id", ids)
    : { data: [] };
  const map = new Map((counts ?? []).map((c) => [c.session_id, c]));
  return (data ?? []).map((s) => ({
    ...(s as unknown as Omit<Session, "booked" | "waitlisted">),
    booked: Number(map.get(s.id)?.booked ?? 0),
    waitlisted: Number(map.get(s.id)?.waitlisted ?? 0),
  })) as Session[];
}

/** Work out how this user can book this session, and what it costs them. */
export async function getEntitlement(userId: string | null, session: Session): Promise<Entitlement> {
  const db = createAdminClient();
  const { data: settings } = await db.from("settings").select("*").eq("id", 1).single();

  if (session.status !== "scheduled") return { kind: "blocked", reason: "This class has been cancelled." };
  const cutoffMs = (settings?.booking_cutoff_minutes ?? 0) * 60_000;
  if (new Date(session.starts_at).getTime() - cutoffMs < Date.now()) {
    return { kind: "blocked", reason: "Booking for this class has closed." };
  }

  if (session.pricing === "free") return { kind: "free", label: "Free" };
  if (session.pricing === "pay_what_you_wish") {
    return { kind: "pay_what_you_wish", suggestedPence: session.suggested_pwyw_pence ?? 800, label: "Pay what you wish" };
  }

  if (userId) {
    // Active membership?
    const { data: membership } = await db
      .from("memberships")
      .select("*, membership_plans(*)")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (membership && session.pricing === "members_included") {
      const plan = membership.membership_plans as Tables<"membership_plans">;
      if (plan.classes_per_period == null) {
        return { kind: "membership", membershipId: membership.id, label: `Included in your ${plan.name}` };
      }
      const periodStart = membership.current_period_start ?? membership.started_at;
      const { count } = await db
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("membership_id", membership.id)
        .in("status", ["booked", "attended"])
        .gte("created_at", periodStart);
      const used = count ?? 0;
      if (used < plan.classes_per_period) {
        return { kind: "membership", membershipId: membership.id, label: `Included (${plan.classes_per_period - used} left this period)` };
      }
    }

    // Class pass with credits?
    const { data: pass } = await db
      .from("class_passes")
      .select("*")
      .eq("user_id", userId)
      .gt("credits_remaining", 0)
      .gt("expires_at", new Date().toISOString())
      .order("expires_at")
      .limit(1)
      .maybeSingle();
    if (pass) {
      return { kind: "class_pass", classPassId: pass.id, remaining: pass.credits_remaining, label: `Use 1 of ${pass.credits_remaining} class pass credits` };
    }
  }

  return { kind: "drop_in", pricePence: session.drop_in_pence, label: "Drop in" };
}

type BookResult = { ok: true; bookingId: string; waitlisted: boolean } | { ok: false; error: string };

/**
 * Create a booking that needs no payment (membership, class pass, free, comp).
 * Paid bookings come through the Stripe webhook, which calls confirmPaidBooking.
 */
export async function createBooking(opts: {
  userId: string;
  session: Session;
  paidWith: "membership" | "class_pass" | "free" | "comp";
  membershipId?: string;
  classPassId?: string;
}): Promise<BookResult> {
  const db = createAdminClient();
  const { userId, session } = opts;

  const { data: existing } = await db
    .from("bookings")
    .select("id, status")
    .eq("session_id", session.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing && existing.status !== "cancelled") return { ok: false, error: "You're already booked on this class." };

  const full = session.booked >= session.capacity;
  const status = full ? "waitlisted" : "booked";

  if (opts.paidWith === "class_pass" && opts.classPassId && !full) {
    const { data: pass } = await db.from("class_passes").select("credits_remaining").eq("id", opts.classPassId).single();
    if (!pass || pass.credits_remaining < 1) return { ok: false, error: "That class pass has no credits left." };
    await db.from("class_passes").update({ credits_remaining: pass.credits_remaining - 1 }).eq("id", opts.classPassId);
  }

  const row = {
    session_id: session.id,
    user_id: userId,
    status,
    paid_with: opts.paidWith,
    amount_pence: 0,
    membership_id: opts.membershipId ?? null,
    class_pass_id: full ? null : (opts.classPassId ?? null),
    cancelled_at: null,
  } as const;

  const { data, error } = existing
    ? await db.from("bookings").update(row).eq("id", existing.id).select("id").single()
    : await db.from("bookings").insert(row).select("id").single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not book." };

  await emit(status === "waitlisted" ? "booking.waitlisted" : "booking.created", userId, {
    booking_id: data.id,
    session_id: session.id,
    class_name: session.class_types.name,
    starts_at: session.starts_at,
    teacher: session.teacher?.full_name ?? null,
    paid_with: opts.paidWith,
  });
  return { ok: true, bookingId: data.id, waitlisted: status === "waitlisted" };
}

/** Called by the Stripe webhook once a drop-in / PWYW payment succeeds. */
export async function confirmPaidBooking(orderId: string) {
  const db = createAdminClient();
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).single();
  if (!order || !order.session_id || !order.user_id) return;
  const session = await getSession(order.session_id);
  if (!session) return;

  const full = session.booked >= session.capacity;
  const { data: existing } = await db
    .from("bookings")
    .select("id")
    .eq("session_id", session.id)
    .eq("user_id", order.user_id)
    .maybeSingle();

  const row = {
    session_id: session.id,
    user_id: order.user_id,
    status: full ? "waitlisted" : "booked",
    paid_with: order.kind === "pay_what_you_wish" ? "pay_what_you_wish" : "drop_in",
    amount_pence: order.amount_pence,
    order_id: order.id,
    cancelled_at: null,
  } as const;

  const { data } = existing
    ? await db.from("bookings").update(row).eq("id", existing.id).select("id").single()
    : await db.from("bookings").insert(row).select("id").single();

  await emit(full ? "booking.waitlisted" : "booking.created", order.user_id, {
    booking_id: data?.id,
    session_id: session.id,
    class_name: session.class_types.name,
    starts_at: session.starts_at,
    teacher: session.teacher?.full_name ?? null,
    paid_with: row.paid_with,
    amount_pence: order.amount_pence,
  });
}

export async function cancelBooking(userId: string, bookingId: string, byStaff = false): Promise<{ ok: boolean; error?: string }> {
  const db = createAdminClient();
  const { data: booking } = await db
    .from("bookings")
    .select("*, class_sessions(*, class_types(name))")
    .eq("id", bookingId)
    .single();
  if (!booking) return { ok: false, error: "Booking not found." };
  if (!byStaff && booking.user_id !== userId) return { ok: false, error: "Not your booking." };
  if (booking.status === "cancelled") return { ok: true };

  const { data: settings } = await db.from("settings").select("cancel_cutoff_hours").eq("id", 1).single();
  const session = booking.class_sessions as Tables<"class_sessions"> & { class_types: { name: string } };
  const lateCancel = new Date(session.starts_at).getTime() - Date.now() < (settings?.cancel_cutoff_hours ?? 2) * 3600_000;

  // Return the class pass credit unless it's a late cancel (staff can always return it).
  if (booking.class_pass_id && booking.status !== "waitlisted" && (!lateCancel || byStaff)) {
    const { data: pass } = await db.from("class_passes").select("credits_remaining").eq("id", booking.class_pass_id).single();
    if (pass) await db.from("class_passes").update({ credits_remaining: pass.credits_remaining + 1 }).eq("id", booking.class_pass_id);
  }

  const wasBooked = booking.status === "booked";
  await db.from("bookings").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", bookingId);

  await emit("booking.cancelled", booking.user_id, {
    booking_id: bookingId,
    session_id: session.id,
    class_name: session.class_types.name,
    starts_at: session.starts_at,
    late_cancel: lateCancel,
    paid_with: booking.paid_with,
    amount_pence: booking.amount_pence,
  });

  if (wasBooked) await promoteWaitlist(session.id);
  return { ok: true };
}

/** Move the earliest waitlisted person into the freed space. */
export async function promoteWaitlist(sessionId: string) {
  const db = createAdminClient();
  const { data: next } = await db
    .from("bookings")
    .select("*, class_sessions(starts_at, class_types(name))")
    .eq("session_id", sessionId)
    .eq("status", "waitlisted")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!next) return;

  if (next.paid_with === "class_pass") {
    const { data: pass } = await db
      .from("class_passes")
      .select("id, credits_remaining")
      .eq("user_id", next.user_id)
      .gt("credits_remaining", 0)
      .gt("expires_at", new Date().toISOString())
      .order("expires_at")
      .limit(1)
      .maybeSingle();
    if (!pass) return; // they no longer have a credit; leave them waitlisted
    await db.from("class_passes").update({ credits_remaining: pass.credits_remaining - 1 }).eq("id", pass.id);
    await db.from("bookings").update({ status: "booked", class_pass_id: pass.id }).eq("id", next.id);
  } else {
    await db.from("bookings").update({ status: "booked" }).eq("id", next.id);
  }
  const s = next.class_sessions as { starts_at: string; class_types: { name: string } };
  await emit("booking.promoted", next.user_id, {
    booking_id: next.id,
    session_id: sessionId,
    class_name: s.class_types.name,
    starts_at: s.starts_at,
  });
}

/** Teacher/admin cancels a whole class: every booked person gets notified, credits go back. */
export async function cancelSession(sessionId: string, reason: string, byUserId: string) {
  const db = createAdminClient();
  const session = await getSession(sessionId);
  if (!session) return { ok: false, error: "Not found" };

  await db.from("class_sessions").update({ status: "cancelled", cancel_reason: reason }).eq("id", sessionId);

  const { data: bookings } = await db
    .from("bookings")
    .select("*, profiles(id, full_name, email, phone, whatsapp_opt_in)")
    .eq("session_id", sessionId)
    .in("status", ["booked", "waitlisted"]);

  for (const b of bookings ?? []) {
    if (b.class_pass_id && b.status === "booked") {
      const { data: pass } = await db.from("class_passes").select("credits_remaining").eq("id", b.class_pass_id).single();
      if (pass) await db.from("class_passes").update({ credits_remaining: pass.credits_remaining + 1 }).eq("id", b.class_pass_id);
    }
    await db.from("bookings").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", b.id);
  }

  await emit("session.cancelled", byUserId, {
    session_id: sessionId,
    class_name: session.class_types.name,
    starts_at: session.starts_at,
    reason,
    affected_user_ids: (bookings ?? []).map((b) => b.user_id),
    affected: (bookings ?? []).map((b) => ({
      user_id: b.user_id,
      full_name: b.profiles?.full_name ?? null,
      email: b.profiles?.email ?? null,
      phone: b.profiles?.phone ?? null,
      whatsapp_opt_in: b.profiles?.whatsapp_opt_in ?? false,
    })),
    paid_bookings: (bookings ?? []).filter((b) => b.amount_pence > 0).map((b) => ({ user_id: b.user_id, amount_pence: b.amount_pence, order_id: b.order_id })),
  });
  return { ok: true, affected: bookings?.length ?? 0 };
}
