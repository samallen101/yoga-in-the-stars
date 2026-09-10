import { notFound, redirect } from "next/navigation";
import { createAdminClient, getCurrentUser } from "@/lib/supabase/server";
import { getSession } from "@/lib/booking";
import { fmtDateTime, initials } from "@/lib/format";
import { BackLink, Notice, StatusPill } from "@/components/ui";
import { markAttendance, cancelClass, addWalkIn } from "./actions";

export default async function TeachSessionPage({ params, searchParams }: PageProps<"/teach/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/teach");
  if (me.profile.role === "yogi") redirect("/me");

  const session = await getSession(id);
  if (!session) notFound();
  if (me.profile.role === "teacher" && session.teacher_id !== me.user.id) redirect("/teach");

  const db = createAdminClient();
  const { data: bookings } = await db
    .from("bookings")
    .select("*, profiles(id, full_name, email, phone, whatsapp_opt_in)")
    .eq("session_id", id)
    .neq("status", "cancelled")
    .order("created_at");

  const list = bookings ?? [];
  const booked = list.filter((b) => b.status !== "waitlisted");
  const waiting = list.filter((b) => b.status === "waitlisted");
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const isPast = new Date(session.starts_at).getTime() < Date.now();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <BackLink href="/teach">Your classes</BackLink>

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-ink-soft">{fmtDateTime(session.starts_at)}</div>
            <h1 className="text-2xl font-semibold text-brand">{session.class_types.name}</h1>
            <div className="text-sm text-ink-soft">{session.teacher?.full_name}{session.locations?.name ? ` · ${session.locations.name}` : ""}</div>
          </div>
          <StatusPill status={session.status} />
        </div>
        <div className="mt-3 text-sm">{booked.length} booked of {session.capacity}{waiting.length ? ` · ${waiting.length} on the waitlist` : ""}</div>
      </div>

      {msg && <Notice kind={msg.startsWith("✓") ? "success" : "error"}>{msg}</Notice>}

      <div className="card p-0">
        <div className="px-5 py-3 border-b border-line font-semibold text-brand">Register</div>
        {booked.length === 0 ? (
          <div className="px-5 py-8 text-center text-ink-soft text-sm">Nobody booked yet.</div>
        ) : (
          <ul className="divide-y divide-line">
            {booked.map((b) => (
              <li key={b.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-brand-soft text-brand flex items-center justify-center text-xs font-semibold shrink-0">{initials(b.profiles?.full_name)}</div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{b.profiles?.full_name || b.profiles?.email}</div>
                    <div className="text-xs text-ink-soft">{b.paid_with.replace("_", " ")}{b.amount_pence ? ` · £${(b.amount_pence / 100).toFixed(2)}` : ""}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {b.status === "attended" ? (
                    <span className="pill bg-green-soft text-green">Here</span>
                  ) : b.status === "no_show" ? (
                    <span className="pill bg-red-soft text-red">No show</span>
                  ) : null}
                  <form action={markAttendance}>
                    <input type="hidden" name="booking_id" value={b.id} />
                    <input type="hidden" name="session_id" value={id} />
                    <input type="hidden" name="status" value={b.status === "attended" ? "booked" : "attended"} />
                    <button className={b.status === "attended" ? "btn-ghost text-xs" : "btn-secondary text-xs"}>{b.status === "attended" ? "Undo" : "Check in"}</button>
                  </form>
                  {isPast && b.status === "booked" && (
                    <form action={markAttendance}>
                      <input type="hidden" name="booking_id" value={b.id} />
                      <input type="hidden" name="session_id" value={id} />
                      <input type="hidden" name="status" value="no_show" />
                      <button className="btn-ghost text-xs">No show</button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {waiting.length > 0 && (
          <>
            <div className="px-5 py-2 border-y border-line text-xs uppercase tracking-wide text-ink-soft">Waitlist</div>
            <ul className="divide-y divide-line">
              {waiting.map((b) => (
                <li key={b.id} className="px-5 py-2 text-sm flex justify-between">
                  <span>{b.profiles?.full_name || b.profiles?.email}</span>
                  <span className="text-ink-soft text-xs">waiting</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <form action={addWalkIn} className="card flex flex-wrap items-end gap-3">
        <input type="hidden" name="session_id" value={id} />
        <div className="flex-1 min-w-[12rem]">
          <label className="label" htmlFor="email">Add a walk-in by email</label>
          <input id="email" name="email" type="email" className="input" placeholder="someone@example.com" required />
        </div>
        <button className="btn-secondary">Add to register</button>
        <p className="w-full text-xs text-ink-soft">They need an account. Their membership or pass is used if they have one, otherwise it's marked as complimentary for you to settle in person.</p>
      </form>

      {session.status === "scheduled" && (
        <form action={cancelClass} className="card space-y-3 border-red/30">
          <input type="hidden" name="session_id" value={id} />
          <h2 className="font-semibold text-red">Cancel this class</h2>
          <p className="text-sm text-ink-soft">Everyone booked ({booked.length + waiting.length}) will be told straight away by WhatsApp and email. Class pass credits go back automatically. Drop-in payments are flagged for a refund.</p>
          <div>
            <label className="label" htmlFor="reason">Reason (they'll see this)</label>
            <input id="reason" name="reason" className="input" placeholder="The pub has a booking tonight, sorry!" required />
          </div>
          <button className="btn-danger">Cancel class and notify everyone</button>
        </form>
      )}
    </div>
  );
}
