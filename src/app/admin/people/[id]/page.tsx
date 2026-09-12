import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate, fmtDateTime, gbp } from "@/lib/format";
import { BackLink, FlagPill, Notice, StatusPill } from "@/components/ui";
import { saveNotes, setRole, grantClassPass, grantMembership, adjustPass, adjustMembership, staffCancelBooking, compBooking, recordPayment } from "./actions";

export default async function PersonPage({ params, searchParams }: PageProps<"/admin/people/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const db = createAdminClient();

  const [{ data: p }, { data: eng }, { data: memberships }, { data: passes }, { data: bookings }, { data: orders }, { data: plans }, { data: passProducts }] = await Promise.all([
    db.from("profiles").select("*").eq("id", id).single(),
    db.from("engagement").select("*").eq("user_id", id).maybeSingle(),
    db.from("memberships").select("*, membership_plans(name)").eq("user_id", id).order("created_at", { ascending: false }),
    db.from("class_passes").select("*, class_pass_products(name)").eq("user_id", id).order("created_at", { ascending: false }),
    db.from("bookings").select("*, class_sessions(starts_at, class_types(name))").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
    db.from("orders").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
    db.from("membership_plans").select("id, name").eq("active", true),
    db.from("class_pass_products").select("id, name, credits").eq("active", true),
  ]);
  const [{ data: momoOrders }, { data: upcoming }] = await Promise.all([
    db.from("momo_orders").select("invoice_date, pricing_option, price, paid, payment_method, credits, start_date, expiry_date").eq("user_id", id).order("invoice_date", { ascending: false }).limit(30),
    db.from("class_sessions").select("id, starts_at, class_types(name)").eq("status", "scheduled").gte("starts_at", new Date().toISOString()).order("starts_at").limit(30),
  ]);
  if (!p) notFound();
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const wa = p.phone ? `https://wa.me/${p.phone.replace(/[^0-9]/g, "").replace(/^0/, "44")}` : null;

  return (
    <div className="space-y-6">
      <BackLink href="/admin/people">People</BackLink>
      <div className="card flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-brand">{p.full_name || p.email}</h1>
          <div className="text-sm text-ink-soft">{p.email}{p.phone ? ` · ${p.phone}` : ""} · joined {fmtDate(p.created_at, "d MMM yyyy")}</div>
          <div className="mt-2 flex items-center gap-2">
            <span className="pill bg-brand-soft text-brand">{p.role}</span>
            {eng && <FlagPill flag={eng.flag} />}
            {eng?.is_member && <span className="pill bg-green-soft text-green">member</span>}
            {p.whatsapp_opt_in && <span className="pill bg-green-soft text-green">WhatsApp ok</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {wa && <a href={wa} target="_blank" rel="noreferrer" className="btn-secondary">WhatsApp</a>}
          <a href={`mailto:${p.email}`} className="btn-ghost">Email</a>
        </div>
      </div>

      {msg && <Notice kind={msg.startsWith("✓") ? "success" : "error"}>{msg}</Notice>}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="font-semibold text-brand mb-2">Memberships</h2>
          {(memberships ?? []).length === 0 ? <p className="text-sm text-ink-soft">None yet.</p> : (
            <ul className="divide-y divide-line text-sm">
              {memberships!.map((m) => (
                <li key={m.id} className="py-2 space-y-1">
                  <div className="flex justify-between">
                    <span>{m.membership_plans?.name} <span className="text-ink-soft">· since {fmtDate(m.started_at, "d MMM yy")}{m.current_period_end ? ` · until ${fmtDate(m.current_period_end, "d MMM yy")}` : ""}</span></span>
                    <StatusPill status={m.status} />
                  </div>
                  {m.status !== "cancelled" && (
                    <form action={adjustMembership} className="flex flex-wrap items-center gap-2 text-xs">
                      <input type="hidden" name="user_id" value={id} /><input type="hidden" name="membership_id" value={m.id} />
                      <span className="text-ink-soft">Fix:</span>
                      <input name="days" type="number" defaultValue={30} className="input w-20 py-1" aria-label="days" />
                      <button name="action" value="extend" className="btn-ghost py-1">Extend by days</button>
                      <button name="action" value="end" className="btn-ghost py-1 text-red">End now</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form action={grantMembership} className="mt-4 flex flex-wrap gap-2 items-end border-t border-line pt-3">
            <input type="hidden" name="user_id" value={id} />
            <div className="flex-1 min-w-[10rem]">
              <label className="label">Grant a membership (no charge)</label>
              <select name="plan_id" className="input">{(plans ?? []).map((pl) => <option key={pl.id} value={pl.id}>{pl.name}</option>)}</select>
            </div>
            <div>
              <label className="label">Days</label>
              <input name="days" type="number" defaultValue={30} className="input w-24" />
            </div>
            <button className="btn-secondary">Grant</button>
          </form>
        </section>

        <section className="card">
          <h2 className="font-semibold text-brand mb-2">Class passes</h2>
          {(passes ?? []).length === 0 ? <p className="text-sm text-ink-soft">None yet.</p> : (
            <ul className="divide-y divide-line text-sm">
              {passes!.map((c) => (
                <li key={c.id} className="py-2 space-y-1">
                  <div className="flex justify-between">
                    <span>{c.class_pass_products?.name ?? "Pass"}</span>
                    <span className="text-ink-soft">{c.credits_remaining}/{c.credits_total} · exp {fmtDate(c.expires_at, "d MMM yy")}</span>
                  </div>
                  <form action={adjustPass} className="flex flex-wrap items-center gap-2 text-xs">
                    <input type="hidden" name="user_id" value={id} /><input type="hidden" name="pass_id" value={c.id} />
                    <span className="text-ink-soft">Fix:</span>
                    <input name="delta" type="number" defaultValue={1} className="input w-16 py-1" aria-label="credits to add (negative to remove)" />
                    <span className="text-ink-soft">credits</span>
                    <input name="expires_at" type="date" className="input py-1" aria-label="new expiry" />
                    <button className="btn-ghost py-1">Apply</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={grantClassPass} className="mt-4 flex flex-wrap gap-2 items-end border-t border-line pt-3">
            <input type="hidden" name="user_id" value={id} />
            <div className="flex-1 min-w-[10rem]">
              <label className="label">Grant a pass (no charge)</label>
              <select name="product_id" className="input">{(passProducts ?? []).map((pp) => <option key={pp.id} value={pp.id}>{pp.name} ({pp.credits})</option>)}</select>
            </div>
            <button className="btn-secondary">Grant</button>
          </form>
        </section>

        <section className="card">
          <h2 className="font-semibold text-brand mb-2">Recent bookings</h2>
          {(bookings ?? []).length === 0 ? <p className="text-sm text-ink-soft">No bookings yet.</p> : (
            <ul className="divide-y divide-line text-sm">
              {bookings!.map((b) => (
                <li key={b.id} className="py-2 flex justify-between gap-2">
                  <span>{b.class_sessions?.class_types.name} <span className="text-ink-soft">· {b.class_sessions ? fmtDateTime(b.class_sessions.starts_at) : ""} · {b.paid_with}</span></span>
                  <span className="flex items-center gap-2">
                    <StatusPill status={b.status} />
                    {(b.status === "booked" || b.status === "waitlisted") && b.class_sessions && new Date(b.class_sessions.starts_at) > new Date() && (
                      <form action={staffCancelBooking}><input type="hidden" name="user_id" value={id} /><input type="hidden" name="booking_id" value={b.id} /><button className="btn-ghost py-0.5 text-xs">Cancel</button></form>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form action={compBooking} className="mt-4 flex flex-wrap gap-2 items-end border-t border-line pt-3">
            <input type="hidden" name="user_id" value={id} />
            <div className="flex-1 min-w-[12rem]">
              <label className="label">Book them on a class for free (comp)</label>
              <select name="session_id" className="input">{(upcoming ?? []).map((s) => <option key={s.id} value={s.id}>{fmtDateTime(s.starts_at)} · {s.class_types.name}</option>)}</select>
            </div>
            <button className="btn-secondary">Book</button>
          </form>
        </section>

        <section className="card">
          <h2 className="font-semibold text-brand mb-2">Payments</h2>
          {(orders ?? []).length === 0 ? <p className="text-sm text-ink-soft">No payments yet.</p> : (
            <ul className="divide-y divide-line text-sm">
              {orders!.map((o) => (
                <li key={o.id} className="py-2 flex justify-between gap-2">
                  <span className="truncate">{o.description ?? o.kind} <span className="text-ink-soft">· {fmtDate(o.created_at, "d MMM yy")}</span></span>
                  <span className="shrink-0 flex items-center gap-2">{gbp(o.amount_pence)} <StatusPill status={o.status} /></span>
                </li>
              ))}
            </ul>
          )}
          <form action={recordPayment} className="mt-4 flex flex-wrap gap-2 items-end border-t border-line pt-3">
            <input type="hidden" name="user_id" value={id} />
            <div><label className="label">Record cash / bank payment</label><input name="amount" type="number" step="0.01" min="0" placeholder="£" className="input w-24" /></div>
            <div className="flex-1 min-w-[10rem]"><label className="label">For</label><input name="description" className="input" placeholder="e.g. 3 Class Pass, paid at the desk" /></div>
            <div><label className="label">Method</label><select name="method" className="input"><option value="cash">Cash</option><option value="bank transfer">Bank transfer</option><option value="other">Other</option></select></div>
            <button className="btn-secondary">Record</button>
          </form>
        </section>
      </div>

      {(p.momo_id || (momoOrders ?? []).length > 0) && (
        <section className="card">
          <h2 className="font-semibold text-brand mb-1">History from Momo</h2>
          <p className="text-xs text-ink-soft mb-3">
            {p.momo_registered_at ? `Registered on Momo ${fmtDate(p.momo_registered_at, "d MMM yyyy")}` : "No Momo registration date"}
            {p.momo_last_class_at ? ` · last class on Momo ${fmtDate(p.momo_last_class_at, "d MMM yyyy")}` : " · never attended on Momo"}
            {p.momo_status ? ` · Momo status: ${p.momo_status}` : ""}
            {p.momo_orders_summary ? ` · Momo listed: ${p.momo_orders_summary}` : ""}
            {p.date_of_birth ? ` · born ${fmtDate(p.date_of_birth, "d MMM yyyy")}` : ""}
            {p.city || p.postal_code ? ` · ${[p.address_line, p.postal_code, p.city].filter(Boolean).join(", ")}` : ""}
          </p>
          {(momoOrders ?? []).length === 0 ? <p className="text-sm text-ink-soft">No Momo orders.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-soft"><th className="py-1 pr-4">Date</th><th className="py-1 pr-4">What</th><th className="py-1 pr-4">Price</th><th className="py-1 pr-4">Paid</th><th className="py-1 pr-4">Method</th><th className="py-1 pr-4">Valid</th><th className="py-1">Credits left</th></tr></thead>
                <tbody>
                  {momoOrders!.map((o, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="py-1 pr-4 whitespace-nowrap">{o.invoice_date ? fmtDate(o.invoice_date, "d MMM yy") : ""}</td>
                      <td className="py-1 pr-4">{o.pricing_option}</td>
                      <td className="py-1 pr-4">{o.price != null ? `£${Number(o.price).toFixed(2)}` : ""}</td>
                      <td className="py-1 pr-4">{o.paid ? "yes" : <span className="text-red">no</span>}</td>
                      <td className="py-1 pr-4">{o.payment_method ?? ""}</td>
                      <td className="py-1 pr-4 whitespace-nowrap">{o.start_date ? fmtDate(o.start_date, "d MMM yy") : ""}{o.expiry_date ? ` to ${fmtDate(o.expiry_date, "d MMM yy")}` : ""}</td>
                      <td className="py-1">{o.credits ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <form action={saveNotes} className="card space-y-2">
          <input type="hidden" name="user_id" value={id} />
          <label className="label" htmlFor="notes">Notes (only the team sees these)</label>
          <textarea id="notes" name="notes" rows={4} defaultValue={p.notes ?? ""} className="input" placeholder="Injuries to be aware of, what they're looking for, how you met..." />
          <button className="btn-secondary">Save notes</button>
        </form>
        <form action={setRole} className="card space-y-2">
          <input type="hidden" name="user_id" value={id} />
          <label className="label" htmlFor="role">Role</label>
          <select id="role" name="role" defaultValue={p.role} className="input">
            <option value="yogi">Yogi</option>
            <option value="teacher">Teacher</option>
            <option value="admin">Admin</option>
          </select>
          <p className="text-xs text-ink-soft">Teachers can manage their own classes. Admins can do everything.</p>
          <button className="btn-secondary">Update role</button>
        </form>
      </div>
    </div>
  );
}
