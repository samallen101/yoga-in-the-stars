import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate, fmtDateTime, gbp } from "@/lib/format";
import { BackLink, FlagPill, Notice, StatusPill } from "@/components/ui";
import { saveNotes, setRole, grantClassPass, grantMembership } from "./actions";

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
                <li key={m.id} className="py-2 flex justify-between">
                  <span>{m.membership_plans?.name} <span className="text-ink-soft">· since {fmtDate(m.started_at, "d MMM yy")}</span></span>
                  <StatusPill status={m.status} />
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
                <li key={c.id} className="py-2 flex justify-between">
                  <span>{c.class_pass_products?.name ?? "Pass"}</span>
                  <span className="text-ink-soft">{c.credits_remaining}/{c.credits_total} · exp {fmtDate(c.expires_at, "d MMM yy")}</span>
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
                  <span>{b.class_sessions?.class_types.name} <span className="text-ink-soft">· {b.class_sessions ? fmtDateTime(b.class_sessions.starts_at) : ""}</span></span>
                  <StatusPill status={b.status} />
                </li>
              ))}
            </ul>
          )}
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
        </section>
      </div>

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
