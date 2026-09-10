import { createAdminClient } from "@/lib/supabase/server";
import { gbp } from "@/lib/format";
import { PageHeader, Notice } from "@/components/ui";
import { savePlan, savePass, toggleActive } from "./actions";

export const metadata = { title: "Plans & passes" };

export default async function PlansPage({ searchParams }: PageProps<"/admin/plans">) {
  const sp = await searchParams;
  const db = createAdminClient();
  const [{ data: plans }, { data: passes }] = await Promise.all([
    db.from("membership_plans").select("*").order("sort_order"),
    db.from("class_pass_products").select("*").order("sort_order"),
  ]);
  const msg = typeof sp.msg === "string" ? sp.msg : null;

  return (
    <div className="space-y-8">
      <PageHeader title="Plans & passes" intro="What people can buy. Prices are created in Stripe automatically the first time a plan is sold, so change the price here by adding a new plan and retiring the old one." />
      {msg && <Notice kind={msg.startsWith("✓") ? "success" : "error"}>{msg}</Notice>}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card p-0">
          <div className="px-5 py-3 border-b border-line font-semibold text-brand">Memberships</div>
          <ul className="divide-y divide-line">
            {(plans ?? []).map((p) => (
              <li key={p.id} className="px-5 py-3 flex items-center justify-between gap-3 text-sm">
                <div>
                  <div className="font-medium">{p.name} <span className="text-ink-soft">· {gbp(p.price_pence)}/{p.interval}</span></div>
                  <div className="text-xs text-ink-soft">{p.classes_per_period == null ? "Unlimited" : `${p.classes_per_period}/period`}{p.event_discount_percent ? ` · ${p.event_discount_percent}% off events` : ""}{p.stripe_price_id ? " · in Stripe" : ""}</div>
                </div>
                <form action={toggleActive}>
                  <input type="hidden" name="table" value="membership_plans" />
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="active" value={p.active ? "0" : "1"} />
                  <button className={p.active ? "btn-ghost text-xs" : "btn-secondary text-xs"}>{p.active ? "Retire" : "Activate"}</button>
                </form>
              </li>
            ))}
            {(plans ?? []).length === 0 && <li className="px-5 py-6 text-sm text-ink-soft">No plans yet.</li>}
          </ul>
        </div>
        <form action={savePlan} className="card space-y-3">
          <h2 className="font-semibold text-brand">New membership plan</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="label">Name</label><input name="name" className="input" required placeholder="Club Membership" /></div>
            <div className="col-span-2"><label className="label">Description</label><textarea name="description" rows={2} className="input" placeholder="Every regular class, member prices on events, and you keep the club alive." /></div>
            <div><label className="label">Price (£)</label><input name="price" type="number" step="0.01" className="input" required /></div>
            <div><label className="label">Billed</label><select name="interval" className="input"><option value="month">Monthly</option><option value="year">Yearly</option></select></div>
            <div><label className="label">Classes per period</label><input name="classes_per_period" type="number" className="input" placeholder="blank = unlimited" /></div>
            <div><label className="label">Event discount %</label><input name="event_discount_percent" type="number" defaultValue={0} className="input" /></div>
          </div>
          <button className="btn-primary">Create plan</button>
        </form>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card p-0">
          <div className="px-5 py-3 border-b border-line font-semibold text-brand">Class passes</div>
          <ul className="divide-y divide-line">
            {(passes ?? []).map((p) => (
              <li key={p.id} className="px-5 py-3 flex items-center justify-between gap-3 text-sm">
                <div>
                  <div className="font-medium">{p.name} <span className="text-ink-soft">· {gbp(p.price_pence)}</span></div>
                  <div className="text-xs text-ink-soft">{p.credits} classes · valid {p.validity_days} days</div>
                </div>
                <form action={toggleActive}>
                  <input type="hidden" name="table" value="class_pass_products" />
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="active" value={p.active ? "0" : "1"} />
                  <button className={p.active ? "btn-ghost text-xs" : "btn-secondary text-xs"}>{p.active ? "Retire" : "Activate"}</button>
                </form>
              </li>
            ))}
            {(passes ?? []).length === 0 && <li className="px-5 py-6 text-sm text-ink-soft">No passes yet.</li>}
          </ul>
        </div>
        <form action={savePass} className="card space-y-3">
          <h2 className="font-semibold text-brand">New class pass</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="label">Name</label><input name="name" className="input" required placeholder="5 Class Pass" /></div>
            <div><label className="label">Classes</label><input name="credits" type="number" className="input" required defaultValue={5} /></div>
            <div><label className="label">Price (£)</label><input name="price" type="number" step="0.01" className="input" required /></div>
            <div><label className="label">Valid for (days)</label><input name="validity_days" type="number" className="input" defaultValue={90} /></div>
          </div>
          <button className="btn-primary">Create pass</button>
        </form>
      </section>
    </div>
  );
}
