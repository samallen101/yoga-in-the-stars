import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession, getEntitlement } from "@/lib/booking";
import { getCurrentUser, createAdminClient } from "@/lib/supabase/server";
import { fmtDate, fmtTime, gbp } from "@/lib/format";
import { BackLink, Notice } from "@/components/ui";
import { bookSession, cancelMyBooking } from "./actions";

export default async function ClassPage({ params, searchParams }: PageProps<"/classes/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await getSession(id);
  if (!session) notFound();
  const me = await getCurrentUser();
  const ent = await getEntitlement(me?.user.id ?? null, session);

  let myBooking: { id: string; status: string } | null = null;
  if (me) {
    const { data } = await createAdminClient()
      .from("bookings")
      .select("id, status")
      .eq("session_id", id)
      .eq("user_id", me.user.id)
      .maybeSingle();
    if (data && data.status !== "cancelled") myBooking = data;
  }

  const spaces = Math.max(0, session.capacity - session.booked);
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const paid = sp.paid === "1";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <BackLink href="/schedule">Schedule</BackLink>

      <div className="card">
        <div className="flex items-center gap-2 text-xs text-ink-soft mb-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: session.class_types.colour }} />
          {fmtDate(session.starts_at, "EEEE d MMMM")} · {fmtTime(session.starts_at)}–{fmtTime(session.ends_at)}
        </div>
        <h1 className="text-3xl font-semibold text-brand">{session.class_types.name}</h1>
        <p className="text-ink-soft mt-1">
          {session.teacher?.full_name ? `with ${session.teacher.full_name}` : ""}
          {session.locations?.name ? ` · ${session.locations.name}` : ""}
        </p>
        {session.class_types.description && <p className="mt-4 text-sm leading-relaxed">{session.class_types.description}</p>}
        {session.notes && <p className="mt-2 text-sm text-ink-soft">{session.notes}</p>}
        <div className="mt-4 text-sm text-ink-soft">
          {session.status === "cancelled"
            ? <span className="pill bg-red-soft text-red">Cancelled{session.cancel_reason ? `: ${session.cancel_reason}` : ""}</span>
            : spaces === 0
              ? `Full · ${session.waitlisted} on the waitlist`
              : `${spaces} of ${session.capacity} spaces left`}
        </div>
      </div>

      {paid && <Notice kind="success">Payment received. Your booking is confirmed and a confirmation is on its way.</Notice>}
      {msg && <Notice kind={msg.startsWith("✓") ? "success" : "error"}>{msg}</Notice>}

      <div className="card space-y-4">
        {myBooking ? (
          <>
            <Notice kind="success">
              {myBooking.status === "waitlisted" ? "You're on the waitlist. We'll message you if a space opens up." : "You're booked on this class. See you there."}
            </Notice>
            <form action={cancelMyBooking}>
              <input type="hidden" name="booking_id" value={myBooking.id} />
              <input type="hidden" name="session_id" value={session.id} />
              <button className="btn-danger">Cancel my booking</button>
            </form>
          </>
        ) : !me ? (
          <div className="text-center py-2">
            <p className="text-ink-soft mb-3">Sign in or create a free account to book.</p>
            <Link href={`/login?next=/classes/${session.id}`} className="btn-primary">Sign in to book</Link>
          </div>
        ) : ent.kind === "blocked" ? (
          <Notice kind="error">{ent.reason}</Notice>
        ) : (
          <form action={bookSession} className="space-y-4">
            <input type="hidden" name="session_id" value={session.id} />
            <div>
              <div className="text-xs uppercase tracking-wide text-ink-soft">How you'll book</div>
              <div className="text-lg font-medium mt-1">{ent.label}</div>
              {ent.kind === "drop_in" && <div className="text-ink-soft text-sm mt-1">{gbp(ent.pricePence)}. Members and class pass holders book for free on member classes.</div>}
            </div>
            {ent.kind === "pay_what_you_wish" && (
              <div>
                <label className="label" htmlFor="amount">Your contribution (£)</label>
                <input id="amount" name="amount" type="number" min="0" step="1" defaultValue={(ent.suggestedPence / 100).toFixed(0)} className="input max-w-[10rem]" />
                <p className="text-xs text-ink-soft mt-1">Suggested {gbp(ent.suggestedPence)}. Give what feels right, including nothing.</p>
              </div>
            )}
            <button className="btn-primary w-full">
              {spaces === 0 ? "Join the waitlist" : ent.kind === "drop_in" ? `Pay ${gbp(ent.pricePence)} and book` : "Book this class"}
            </button>
            {ent.kind === "drop_in" && (
              <p className="text-xs text-center text-ink-soft">
                Or <Link href="/membership" className="text-brand">join the club</Link> and every class is included.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
