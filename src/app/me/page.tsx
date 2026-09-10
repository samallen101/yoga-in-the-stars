import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient, getCurrentUser } from "@/lib/supabase/server";
import { fmtDateTime, fmtDate } from "@/lib/format";
import { PageHeader, Notice, StatusPill, Empty } from "@/components/ui";
import { openBillingPortal } from "@/app/membership/actions";
import { cancelMyBooking } from "@/app/classes/[id]/actions";
import { updateProfile } from "./actions";

export const metadata = { title: "My club" };

export default async function MePage({ searchParams }: PageProps<"/me">) {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/me");
  const sp = await searchParams;
  const db = createAdminClient();

  const [{ data: membership }, { data: passes }, { data: upcoming }, { data: past }, { data: settings }] = await Promise.all([
    db.from("memberships").select("*, membership_plans(*)").eq("user_id", me.user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("class_passes").select("*, class_pass_products(name)").eq("user_id", me.user.id).gt("credits_remaining", 0).gt("expires_at", new Date().toISOString()).order("expires_at"),
    db.from("bookings").select("*, class_sessions(*, class_types(name, colour), teacher:profiles!class_sessions_teacher_id_fkey(full_name))").eq("user_id", me.user.id).in("status", ["booked", "waitlisted"]).gte("class_sessions.starts_at", new Date().toISOString()).order("created_at"),
    db.from("bookings").select("id, status, class_sessions(starts_at, class_types(name))").eq("user_id", me.user.id).in("status", ["booked", "attended"]).lt("class_sessions.starts_at", new Date().toISOString()).limit(8),
    db.from("settings").select("whatsapp_community_url").eq("id", 1).single(),
  ]);

  const upcomingList = (upcoming ?? []).filter((b) => b.class_sessions).sort((a, b) => a.class_sessions!.starts_at.localeCompare(b.class_sessions!.starts_at));
  const pastList = (past ?? []).filter((b) => b.class_sessions).sort((a, b) => b.class_sessions!.starts_at.localeCompare(a.class_sessions!.starts_at));

  return (
    <div className="space-y-8">
      <PageHeader title={`Hi ${me.profile.full_name?.split(" ")[0] || "there"}`} intro="Your bookings, membership and details." />

      {sp.joined === "1" && <Notice kind="success">Welcome to the club. Your membership is active and every regular class is now included.</Notice>}
      {sp.pass === "1" && <Notice kind="success">Your class pass is ready. Book a class from the schedule and it'll be used automatically.</Notice>}
      {sp.saved === "1" && <Notice kind="success">Details saved.</Notice>}

      {settings?.whatsapp_community_url && membership?.status === "active" && (
        <Notice>
          Members' WhatsApp community: <a className="underline" href={settings.whatsapp_community_url} target="_blank" rel="noreferrer">join here</a>.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-brand mb-3">Upcoming classes</h2>
            {upcomingList.length === 0 ? (
              <Empty>Nothing booked yet. <Link href="/schedule" className="text-brand underline">See the schedule</Link>.</Empty>
            ) : (
              <div className="space-y-2">
                {upcomingList.map((b) => {
                  const s = b.class_sessions!;
                  return (
                    <div key={b.id} className="card flex items-center justify-between gap-3 py-4">
                      <div>
                        <Link href={`/classes/${s.id}`} className="font-medium hover:text-brand">{s.class_types.name}</Link>
                        <div className="text-sm text-ink-soft">{fmtDateTime(s.starts_at)}{s.teacher?.full_name ? ` · ${s.teacher.full_name}` : ""}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusPill status={b.status} />
                        <form action={cancelMyBooking}>
                          <input type="hidden" name="booking_id" value={b.id} />
                          <input type="hidden" name="session_id" value={s.id} />
                          <button className="btn-ghost text-xs">Cancel</button>
                        </form>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {pastList.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-brand mb-3">Recent classes</h2>
              <div className="card divide-y divide-line">
                {pastList.map((b) => (
                  <div key={b.id} className="py-2 flex justify-between text-sm">
                    <span>{b.class_sessions!.class_types.name}</span>
                    <span className="text-ink-soft">{fmtDate(b.class_sessions!.starts_at, "d MMM")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <div className="card">
            <h2 className="font-semibold text-brand mb-2">Membership</h2>
            {membership && membership.status !== "incomplete" ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-medium">{membership.membership_plans.name}</span>
                  <StatusPill status={membership.status} />
                </div>
                <div className="text-sm text-ink-soft mt-1">
                  {membership.status === "active" && membership.current_period_end && `Renews ${fmtDate(membership.current_period_end, "d MMM yyyy")}`}
                  {membership.status === "paused" && membership.paused_until && `Paused until ${fmtDate(membership.paused_until, "d MMM yyyy")}`}
                  {membership.status === "past_due" && "Your last payment didn't go through. Update your card below."}
                  {membership.status === "cancelled" && "Cancelled. You're welcome back any time."}
                </div>
                <form action={openBillingPortal} className="mt-3">
                  <button className="btn-secondary w-full">Manage membership</button>
                </form>
                <p className="text-xs text-ink-soft mt-2">Update your card, pause, or cancel. Secure page from Stripe.</p>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-soft">You're not a member yet.</p>
                <Link href="/membership" className="btn-primary w-full mt-3">Join the club</Link>
              </>
            )}
          </div>

          <div className="card">
            <h2 className="font-semibold text-brand mb-2">Class passes</h2>
            {(passes ?? []).length === 0 ? (
              <p className="text-sm text-ink-soft">No active passes. <Link href="/membership" className="text-brand underline">Buy one</Link>.</p>
            ) : (
              <ul className="text-sm space-y-2">
                {passes!.map((p) => (
                  <li key={p.id} className="flex justify-between">
                    <span>{p.class_pass_products?.name ?? "Class pass"}</span>
                    <span className="text-ink-soft">{p.credits_remaining} left · exp {fmtDate(p.expires_at, "d MMM")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form action={updateProfile} className="card space-y-3">
            <h2 className="font-semibold text-brand">Your details</h2>
            <div>
              <label className="label" htmlFor="full_name">Name</label>
              <input id="full_name" name="full_name" defaultValue={me.profile.full_name ?? ""} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="phone">Mobile</label>
              <input id="phone" name="phone" defaultValue={me.profile.phone ?? ""} className="input" />
            </div>
            <label className="flex items-start gap-2 text-sm text-ink-soft">
              <input type="checkbox" name="whatsapp_opt_in" defaultChecked={me.profile.whatsapp_opt_in} className="mt-1" />
              <span>WhatsApp me about bookings, changes and club news</span>
            </label>
            <button className="btn-secondary w-full">Save</button>
          </form>
        </aside>
      </div>

      <p className="text-xs text-ink-soft">Signed in as {me.profile.email}. Payments are taken securely by Stripe.</p>
    </div>
  );
}
