import Link from "next/link";
import { createAdminClient, getCurrentUser } from "@/lib/supabase/server";
import { gbp } from "@/lib/format";
import { PageHeader, Notice } from "@/components/ui";
import { startPlanCheckout, startPassCheckout } from "./actions";

export const metadata = { title: "Membership" };

export default async function MembershipPage({ searchParams }: PageProps<"/membership">) {
  const sp = await searchParams;
  const db = createAdminClient();
  const [me, { data: plans }, { data: passes }] = await Promise.all([
    getCurrentUser(),
    db.from("membership_plans").select("*").eq("active", true).order("sort_order"),
    db.from("class_pass_products").select("*").eq("active", true).order("sort_order"),
  ]);

  let isMember = false;
  if (me) {
    const { data } = await db.rpc("is_active_member", { uid: me.user.id });
    isMember = Boolean(data);
  }
  const msg = typeof sp.msg === "string" ? sp.msg : null;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Join the club"
        intro="Members keep the space alive. In return, every regular class is included and you get member prices on gigs, breathwork and retreats."
      />
      {msg && <Notice kind="error">{msg}</Notice>}
      {isMember && <Notice kind="success">You're a member. Thank you for keeping the club going. Manage your membership in <Link href="/me" className="underline">My club</Link>.</Notice>}

      <section>
        <h2 className="text-2xl font-semibold text-brand mb-4">Memberships</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(plans ?? []).map((p) => (
            <form key={p.id} action={startPlanCheckout} className="card flex flex-col">
              <input type="hidden" name="plan_id" value={p.id} />
              <h3 className="text-xl font-semibold">{p.name}</h3>
              <div className="mt-2 text-3xl font-semibold serif text-brand">
                {gbp(p.price_pence)}<span className="text-base text-ink-soft font-sans font-normal">/{p.interval}</span>
              </div>
              <p className="mt-3 text-sm text-ink-soft flex-1">{p.description}</p>
              <ul className="mt-3 text-sm space-y-1 text-ink-soft">
                <li>· {p.classes_per_period == null ? "Unlimited classes" : `${p.classes_per_period} classes per ${p.interval}`}</li>
                {p.event_discount_percent > 0 && <li>· {p.event_discount_percent}% off events</li>}
                <li>· Pause or cancel any time</li>
              </ul>
              {me ? (
                <button className="btn-primary mt-5" disabled={isMember}>{isMember ? "You're a member" : "Join"}</button>
              ) : (
                <Link href="/register?next=/membership" className="btn-primary mt-5">Create an account to join</Link>
              )}
            </form>
          ))}
          {(plans ?? []).length === 0 && <div className="card text-ink-soft">Membership options coming soon.</div>}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-brand mb-1">Class passes</h2>
        <p className="text-ink-soft mb-4">Not ready for a membership? Buy a bundle and use it whenever you like.</p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(passes ?? []).map((p) => (
            <form key={p.id} action={startPassCheckout} className="card flex flex-col">
              <input type="hidden" name="product_id" value={p.id} />
              <h3 className="text-xl font-semibold">{p.name}</h3>
              <div className="mt-2 text-3xl font-semibold serif text-brand">{gbp(p.price_pence)}</div>
              <p className="mt-1 text-sm text-ink-soft">{gbp(Math.round(p.price_pence / p.credits))} per class · valid {p.validity_days} days</p>
              {p.description && <p className="mt-3 text-sm text-ink-soft flex-1">{p.description}</p>}
              {me ? (
                <button className="btn-secondary mt-5">Buy {p.credits} classes</button>
              ) : (
                <Link href="/register?next=/membership" className="btn-secondary mt-5">Create an account to buy</Link>
              )}
            </form>
          ))}
          {(passes ?? []).length === 0 && <div className="card text-ink-soft">Class passes coming soon.</div>}
        </div>
      </section>
    </div>
  );
}
