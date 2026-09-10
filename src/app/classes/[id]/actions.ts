"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession, getEntitlement, createBooking, cancelBooking } from "@/lib/booking";
import { checkoutForSession } from "@/lib/checkout";
import { getCurrentUser } from "@/lib/supabase/server";

function back(sessionId: string, msg: string): never {
  redirect(`/classes/${sessionId}?msg=${encodeURIComponent(msg)}`);
}

export async function bookSession(formData: FormData) {
  const sessionId = String(formData.get("session_id"));
  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=/classes/${sessionId}`);

  const session = await getSession(sessionId);
  if (!session) back(sessionId, "Class not found.");
  const ent = await getEntitlement(me.user.id, session);

  let url: string | null = null;
  switch (ent.kind) {
    case "blocked":
      back(sessionId, ent.reason);
      break;
    case "membership": {
      const r = await createBooking({ userId: me.user.id, session, paidWith: "membership", membershipId: ent.membershipId });
      if (!r.ok) back(sessionId, r.error);
      break;
    }
    case "class_pass": {
      const r = await createBooking({ userId: me.user.id, session, paidWith: "class_pass", classPassId: ent.classPassId });
      if (!r.ok) back(sessionId, r.error);
      break;
    }
    case "free": {
      const r = await createBooking({ userId: me.user.id, session, paidWith: "free" });
      if (!r.ok) back(sessionId, r.error);
      break;
    }
    case "pay_what_you_wish": {
      const pounds = Number(formData.get("amount") ?? 0);
      const pence = Math.max(0, Math.round(pounds * 100));
      if (pence === 0) {
        const r = await createBooking({ userId: me.user.id, session, paidWith: "free" });
        if (!r.ok) back(sessionId, r.error);
      } else if (pence < 100) {
        back(sessionId, "Card payments need to be at least £1. Enter 0 to book for free.");
      } else {
        url = await checkoutForSession({ profile: me.profile, session, amountPence: pence, kind: "pay_what_you_wish" });
      }
      break;
    }
    case "drop_in": {
      // Waitlist doesn't charge: hold the place without payment, charge on promotion (handled manually for now).
      if (session.booked >= session.capacity) {
        const r = await createBooking({ userId: me.user.id, session, paidWith: "comp" });
        if (!r.ok) back(sessionId, r.error);
      } else {
        url = await checkoutForSession({ profile: me.profile, session, amountPence: ent.pricePence, kind: "drop_in" });
      }
      break;
    }
  }

  revalidatePath(`/classes/${sessionId}`);
  revalidatePath("/schedule");
  if (url) redirect(url);
  back(sessionId, "✓ Booked. See you on the mat.");
}

export async function cancelMyBooking(formData: FormData) {
  const bookingId = String(formData.get("booking_id"));
  const sessionId = String(formData.get("session_id"));
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const r = await cancelBooking(me.user.id, bookingId);
  revalidatePath(`/classes/${sessionId}`);
  revalidatePath("/me");
  back(sessionId, r.ok ? "✓ Your booking has been cancelled." : (r.error ?? "Could not cancel."));
}
