"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient, getCurrentUser } from "@/lib/supabase/server";
import { cancelSession, createBooking, getEntitlement, getSession } from "@/lib/booking";

async function staffOrRedirect(sessionId: string) {
  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=/teach/${sessionId}`);
  if (me.profile.role === "yogi") redirect("/me");
  const session = await getSession(sessionId);
  if (!session) redirect("/teach");
  if (me.profile.role === "teacher" && session.teacher_id !== me.user.id) redirect("/teach");
  return { me, session };
}

function back(sessionId: string, msg: string): never {
  redirect(`/teach/${sessionId}?msg=${encodeURIComponent(msg)}`);
}

export async function markAttendance(formData: FormData) {
  const sessionId = String(formData.get("session_id"));
  await staffOrRedirect(sessionId);
  const status = String(formData.get("status")) as "attended" | "booked" | "no_show";
  await createAdminClient()
    .from("bookings")
    .update({ status, checked_in_at: status === "attended" ? new Date().toISOString() : null })
    .eq("id", String(formData.get("booking_id")));
  revalidatePath(`/teach/${sessionId}`);
  redirect(`/teach/${sessionId}`);
}

export async function addWalkIn(formData: FormData) {
  const sessionId = String(formData.get("session_id"));
  const { session } = await staffOrRedirect(sessionId);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const db = createAdminClient();
  const { data: person } = await db.from("profiles").select("id, full_name").eq("email", email).maybeSingle();
  if (!person) back(sessionId, `No account for ${email}. Ask them to register first.`);

  const ent = await getEntitlement(person.id, session);
  let r;
  if (ent.kind === "membership") r = await createBooking({ userId: person.id, session, paidWith: "membership", membershipId: ent.membershipId });
  else if (ent.kind === "class_pass") r = await createBooking({ userId: person.id, session, paidWith: "class_pass", classPassId: ent.classPassId });
  else if (ent.kind === "free") r = await createBooking({ userId: person.id, session, paidWith: "free" });
  else r = await createBooking({ userId: person.id, session, paidWith: "comp" });

  revalidatePath(`/teach/${sessionId}`);
  back(sessionId, r.ok ? `✓ Added ${person.full_name || email}.` : r.error);
}

export async function cancelClass(formData: FormData) {
  const sessionId = String(formData.get("session_id"));
  const { me } = await staffOrRedirect(sessionId);
  const reason = String(formData.get("reason") ?? "").trim();
  const r = await cancelSession(sessionId, reason, me.user.id);
  revalidatePath(`/teach/${sessionId}`);
  revalidatePath("/schedule");
  back(sessionId, r.ok ? `✓ Class cancelled. ${r.affected ?? 0} people are being notified.` : (r.error ?? "Could not cancel."));
}
