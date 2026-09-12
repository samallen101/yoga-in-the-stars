"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, Cell,
} from "recharts";
import { CATEGORIES, type Insights, type Category } from "@/lib/insights-types";

// Categorical palette (validated, fixed order) and neutrals that match the site.
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const CAT_COLOUR = Object.fromEntries(CATEGORIES.map((c, i) => [c, SERIES[i]])) as Record<Category, string>;
const INK = "#1f1c17", INK_SOFT = "#6b655c", GRID = "#e6dfd2", SERIOUS = "#c2410c";

const gbp = (n: number) => "£" + Math.round(n).toLocaleString("en-GB");
const monthLabel = (k: string) => new Date(k + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });

type Range = 12 | 24 | 0;

export default function InsightsCharts({ data }: { data: Insights }) {
  const [range, setRange] = useState<Range>(24);
  const [cats, setCats] = useState<Set<Category>>(new Set(CATEGORIES));
  const monthly = useMemo(() => (range ? data.monthly.slice(-range) : data.monthly), [data.monthly, range]);
  const t = data.totals;
  const change = t.revenuePrev12m ? Math.round(((t.revenue12m - t.revenuePrev12m) / t.revenuePrev12m) * 100) : null;

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Taken, last 12 months" value={gbp(t.revenue12m)} hint={change === null ? "" : `${change >= 0 ? "up" : "down"} ${Math.abs(change)}% on the 12 months before`} />
        <Tile label="Average per month" value={gbp(t.avgMonthly12m)} hint="paid orders, last 12 months" />
        <Tile label="Paying members today" value={String(t.paidNow)} hint={`plus ${t.freeNow} on free memberships`} />
        <Tile label="Failed card payments" value={String(t.failed60d)} hint="in the last 60 days, unchased" tone={t.failed60d > 0 ? "warn" : undefined} />
        <Tile label="People on the books" value={t.people.toLocaleString("en-GB")} hint={`${t.active} marked active by Momo · ${t.withPhone.toLocaleString("en-GB")} with a mobile`} />
        <Tile label="Passes with credits left" value={String(t.passesWithCredits)} hint="class passes people can still use" />
        <Tile label="Orders ever" value={t.orders.toLocaleString("en-GB")} hint={`${gbp(t.lifetimeRevenue)} taken since the start`} />
        <Tile label="Data as of" value={new Date(data.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} hint="from the Momo export loaded on 12 Sep 2026" />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-soft">Show</span>
        {([12, 24, 0] as Range[]).map((r) => (
          <button key={r} onClick={() => setRange(r)} className={`rounded-full px-3 py-1 border ${range === r ? "bg-brand text-white border-brand" : "border-line text-ink hover:bg-bg-soft"}`}>
            {r === 0 ? "Everything" : `Last ${r} months`}
          </button>
        ))}
        <span className="ml-4 text-ink-soft">Categories</span>
        {CATEGORIES.map((c) => (
          <button key={c} onClick={() => setCats((s) => { const n = new Set(s); if (n.has(c)) { if (n.size > 1) n.delete(c); } else n.add(c); return n; })}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 border text-xs ${cats.has(c) ? "border-line bg-white" : "border-line/50 text-ink-soft opacity-50"}`}>
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CAT_COLOUR[c] }} />{c}
          </button>
        ))}
      </div>

      <ChartCard title="Money taken each month" intro="Paid orders by month, split by what was bought. Hover a bar for the breakdown."
        table={{ columns: ["Month", ...CATEGORIES.filter((c) => cats.has(c)), "Total"], rows: monthly.map((m) => [monthLabel(m.month), ...CATEGORIES.filter((c) => cats.has(c)).map((c) => gbp(m.revenue[c])), gbp(m.revenueTotal)]) }}>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={monthly.map((m) => ({ month: monthLabel(m.month), ...m.revenue }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="month" tick={{ fill: INK_SOFT, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: INK_SOFT, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => gbp(v)} width={56} />
            <Tooltip content={<Tip money />} cursor={{ fill: "#f0e9dc" }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: INK }} />
            {CATEGORIES.filter((c) => cats.has(c)).map((c) => <Bar key={c} dataKey={c} stackId="a" fill={CAT_COLOUR[c]} stroke="#fff" strokeWidth={1} />)}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Members over time" intro="People holding a membership in each month. Paying and free (teachers, home members, couples partners) shown separately."
          table={{ columns: ["Month", "Paying", "Free"], rows: monthly.map((m) => [monthLabel(m.month), String(m.paidMembers), String(m.freeMembers)]) }}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthly.map((m) => ({ month: monthLabel(m.month), Paying: m.paidMembers, Free: m.freeMembers }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="month" tick={{ fill: INK_SOFT, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: INK_SOFT, fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
              <Tooltip content={<Tip />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: INK }} />
              <Line type="monotone" dataKey="Paying" stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="Free" stroke={SERIES[2]} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="New people each month" intro="Registrations on Momo versus people making their first ever paid order. The gap is the free-to-paid funnel."
          table={{ columns: ["Month", "Registered", "First purchase"], rows: monthly.map((m) => [monthLabel(m.month), String(m.newRegistrations), String(m.newPayers)]) }}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthly.map((m) => ({ month: monthLabel(m.month), Registered: m.newRegistrations, "First purchase": m.newPayers }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="month" tick={{ fill: INK_SOFT, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: INK_SOFT, fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
              <Tooltip content={<Tip />} cursor={{ fill: "#f0e9dc" }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: INK }} />
              <Bar dataKey="Registered" fill={SERIES[0]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="First purchase" fill={SERIES[1]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Failed card payments" intro="Renewals and purchases where the card was declined. Each one is a member to contact, and probably money left on the table."
          table={{ columns: ["Month", "Failed"], rows: monthly.map((m) => [monthLabel(m.month), String(m.failed)]) }}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthly.map((m) => ({ month: monthLabel(m.month), Failed: m.failed }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="month" tick={{ fill: INK_SOFT, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: INK_SOFT, fontSize: 11 }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
              <Tooltip content={<Tip />} cursor={{ fill: "#f0e9dc" }} />
              <Bar dataKey="Failed" fill={SERIOUS} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="When people last came to class" intro="Everyone on the books, by how long since their last class. The middle buckets are the win-back list."
          table={{ columns: ["Last class", "People"], rows: data.recency.map((r) => [r.bucket, String(r.people)]) }}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.recency} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke={GRID} />
              <XAxis type="number" tick={{ fill: INK_SOFT, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="bucket" tick={{ fill: INK, fontSize: 12 }} axisLine={false} tickLine={false} width={120} />
              <Tooltip content={<Tip />} cursor={{ fill: "#f0e9dc" }} />
              <Bar dataKey="people" name="People" fill={SERIES[0]} radius={[0, 4, 4, 0]} label={{ position: "right", fill: INK_SOFT, fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="What sells" intro="The twelve pricing options that have brought in the most money, ever. Coloured by category."
        table={{ columns: ["Option", "Category", "Orders", "Taken", "Average"], rows: data.topOptions.map((o) => [o.name, o.category, String(o.orders), gbp(o.revenue), gbp(o.avg)]) }}>
        <ResponsiveContainer width="100%" height={380}>
          <BarChart data={data.topOptions.map((o) => ({ ...o, short: o.name.length > 34 ? o.name.slice(0, 32) + "…" : o.name }))} layout="vertical" margin={{ top: 4, right: 60, left: 8, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" tick={{ fill: INK_SOFT, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => gbp(v)} />
            <YAxis type="category" dataKey="short" tick={{ fill: INK, fontSize: 11 }} axisLine={false} tickLine={false} width={220} />
            <Tooltip content={<Tip money />} cursor={{ fill: "#f0e9dc" }} />
            <Bar dataKey="revenue" name="Taken" radius={[0, 4, 4, 0]} label={{ position: "right", fill: INK_SOFT, fontSize: 11, formatter: (v: unknown) => gbp(Number(v)) }}>
              {data.topOptions.map((o) => <Cell key={o.name} fill={CAT_COLOUR[o.category]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Do members stay?" intro="Of people who started a paid membership, the share still paying N months later (all start months combined)."
          table={{ columns: ["Months after joining", "Still paying"], rows: data.retentionCurve.map((r) => [String(r.month), r.retained + "%"]) }}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.retentionCurve} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="month" tick={{ fill: INK_SOFT, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}m`} />
              <YAxis tick={{ fill: INK_SOFT, fontSize: 11 }} axisLine={false} tickLine={false} width={40} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<Tip pct />} />
              <Line type="monotone" dataKey="retained" name="Still paying" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4, fill: SERIES[0] }} activeDot={{ r: 6 }} label={{ position: "top", fill: INK_SOFT, fontSize: 11, formatter: (v: unknown) => `${v}%` }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="How long today's paying members have been with you" intro="Counted from their first paid membership."
          table={{ columns: ["Tenure", "Members"], rows: data.tenure.map((r) => [r.bucket, String(r.members)]) }}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.tenure} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="bucket" tick={{ fill: INK_SOFT, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: INK_SOFT, fontSize: 11 }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
              <Tooltip content={<Tip />} cursor={{ fill: "#f0e9dc" }} />
              <Bar dataKey="members" name="Members" fill={SERIES[0]} radius={[4, 4, 0, 0]} label={{ position: "top", fill: INK_SOFT, fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Retention by month people joined" intro="Each row is the people who started a paid membership that month, and how many were still paying 1, 3, 6 and 12 months on. Blank means not enough time has passed yet." table={null}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-soft"><th className="py-2 pr-4">Joined</th><th className="py-2 pr-4">People</th><th className="py-2 pr-4">1 month</th><th className="py-2 pr-4">3 months</th><th className="py-2 pr-4">6 months</th><th className="py-2 pr-4">12 months</th></tr></thead>
            <tbody>
              {data.retention.map((r) => (
                <tr key={r.cohort} className="border-t border-line">
                  <td className="py-1.5 pr-4">{monthLabel(r.cohort)}</td><td className="py-1.5 pr-4">{r.size}</td>
                  {[r.m1, r.m3, r.m6, r.m12].map((v, i) => (
                    <td key={i} className="py-1.5 pr-4">
                      {v === null ? <span className="text-ink-soft">·</span> : (
                        <span className="inline-flex items-center gap-2"><span className="inline-block h-2 rounded-sm" style={{ width: Math.max(4, v * 0.6), background: v >= 60 ? SERIES[2] : v >= 30 ? SERIES[3] : SERIOUS }} />{v}%</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="How much people have spent, ever" intro="Everyone who has ever made a paid order, grouped by lifetime spend."
          table={{ columns: ["Lifetime spend", "People"], rows: data.ltv.map((r) => [r.bucket, String(r.people)]) }}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.ltv} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="bucket" tick={{ fill: INK_SOFT, fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
              <YAxis tick={{ fill: INK_SOFT, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip content={<Tip />} cursor={{ fill: "#f0e9dc" }} />
              <Bar dataKey="people" name="People" fill={SERIES[0]} radius={[4, 4, 0, 0]} label={{ position: "top", fill: INK_SOFT, fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Your most valuable people" intro="Top twenty by lifetime spend. Worth a personal thank you." table={null}>
          <ol className="divide-y divide-line text-sm">
            {data.topPeople.map((p, i) => (
              <li key={p.id} className="flex items-center justify-between py-1.5">
                <span className="flex items-center gap-3"><span className="w-5 text-right text-ink-soft">{i + 1}</span><a className="font-medium hover:text-brand" href={`/admin/people/${p.id}`}>{p.name}</a></span>
                <span className="flex items-center gap-4 text-ink-soft"><span>{p.orders} orders</span><span className={p.status === "Active" ? "text-green" : ""}>{p.status === "Active" ? "active" : p.lastClass ? `last class ${new Date(p.lastClass).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}` : "never attended"}</span><span className="font-medium text-ink w-16 text-right">{gbp(p.spend)}</span></span>
              </li>
            ))}
          </ol>
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="Ages" intro="Where a date of birth was given." table={{ columns: ["Age", "People"], rows: data.ages.map((r) => [r.bucket, String(r.people)]) }}>
          <MiniBars data={data.ages.map((r) => ({ name: r.bucket, value: r.people }))} />
        </ChartCard>
        <ChartCard title="Where people live" intro="Top postcode areas." table={{ columns: ["Postcode area", "People"], rows: data.areas.map((r) => [r.area, String(r.people)]) }}>
          <MiniBars data={data.areas.map((r) => ({ name: r.area, value: r.people }))} />
        </ChartCard>
        <ChartCard title="Day people buy" intro="Paid orders by day of the week." table={{ columns: ["Day", "Orders"], rows: data.weekday.map((r) => [r.day, String(r.orders)]) }}>
          <MiniBars data={data.weekday.map((r) => ({ name: r.day, value: r.orders }))} />
        </ChartCard>
        <ChartCard title="How people pay" intro="Paid orders by payment method. Gift means free." table={{ columns: ["Method", "Orders", "Taken"], rows: data.paymentMethods.map((r) => [r.method, String(r.orders), gbp(r.revenue)]) }}>
          <MiniBars data={data.paymentMethods.map((r) => ({ name: r.method, value: r.orders }))} />
        </ChartCard>
        <ChartCard title="Promo codes" intro="Times each code has been used." table={{ columns: ["Code", "Uses"], rows: data.promoCodes.map((r) => [r.code, String(r.uses)]) }}>
          <MiniBars data={data.promoCodes.map((r) => ({ name: r.code, value: r.uses }))} />
        </ChartCard>
        <ChartCard title="Orders per month" intro="All paid orders, whatever the size." table={{ columns: ["Month", "Orders", "Distinct buyers"], rows: monthly.map((m) => [monthLabel(m.month), String(m.orders), String(m.payers)]) }}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthly.map((m) => ({ month: monthLabel(m.month), Orders: m.orders, Buyers: m.payers }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="month" tick={{ fill: INK_SOFT, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: INK_SOFT, fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
              <Tooltip content={<Tip />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: INK }} />
              <Line type="monotone" dataKey="Orders" stroke={SERIES[0]} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Buyers" stroke={SERIES[1]} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-ink-soft">{label}</div>
      <div className={`mt-1 text-3xl font-semibold serif ${tone === "warn" ? "text-orange" : "text-brand"}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-soft">{hint}</div>}
    </div>
  );
}

function ChartCard({ title, intro, children, table }: { title: string; intro: string; children: ReactNode; table: { columns: string[]; rows: string[][] } | null }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className="card">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div><h2 className="font-semibold text-brand">{title}</h2><p className="text-xs text-ink-soft">{intro}</p></div>
        {table && (
          <div className="flex shrink-0 rounded-full border border-line text-xs">
            <button onClick={() => setView("chart")} className={`rounded-full px-2.5 py-1 ${view === "chart" ? "bg-brand text-white" : "text-ink-soft"}`}>Chart</button>
            <button onClick={() => setView("table")} className={`rounded-full px-2.5 py-1 ${view === "table" ? "bg-brand text-white" : "text-ink-soft"}`}>Table</button>
          </div>
        )}
      </div>
      {view === "chart" || !table ? children : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-soft">{table.columns.map((c) => <th key={c} className="py-2 pr-4">{c}</th>)}</tr></thead>
            <tbody>{table.rows.map((r, i) => <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className="py-1.5 pr-4">{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MiniBars({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 26)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" tick={{ fill: INK, fontSize: 11 }} axisLine={false} tickLine={false} width={96} />
        <Tooltip content={<Tip />} cursor={{ fill: "#f0e9dc" }} />
        <Bar dataKey="value" name="Count" fill={SERIES[0]} radius={[0, 4, 4, 0]} label={{ position: "right", fill: INK_SOFT, fontSize: 11 }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Tip({ active, payload, label, money, pct }: { active?: boolean; payload?: { name?: string; value?: number; color?: string }[]; label?: string; money?: boolean; pct?: boolean }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((a, p) => a + (Number(p.value) || 0), 0);
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-sm">
      {label && <div className="mb-1 font-medium text-ink">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-ink-soft"><span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}</span>
          <span className="text-ink">{money ? gbp(Number(p.value)) : pct ? `${p.value}%` : p.value}</span>
        </div>
      ))}
      {money && payload.length > 1 && <div className="mt-1 flex justify-between gap-4 border-t border-line pt-1 font-medium"><span>Total</span><span>{gbp(total)}</span></div>}
    </div>
  );
}
