import Link from "next/link";
import { getEngagement } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";
import { PageHeader, FlagPill } from "@/components/ui";

export const metadata = { title: "People" };

export default async function PeoplePage({ searchParams }: PageProps<"/admin/people">) {
  const sp = await searchParams;
  const flag = typeof sp.flag === "string" ? sp.flag : "all";
  const q = typeof sp.q === "string" ? sp.q.toLowerCase() : "";

  const [engagement, { data: staff }] = await Promise.all([
    getEngagement(),
    createAdminClient().from("profiles").select("id, full_name, email, role").neq("role", "yogi").order("full_name"),
  ]);

  let rows = engagement;
  if (flag === "members") rows = rows.filter((r) => r.is_member);
  else if (flag === "at_risk") rows = rows.filter((r) => r.flag === "orange" || r.flag === "red");
  else if (flag === "new") rows = rows.filter((r) => r.flag === "new");
  else if (flag === "non_members") rows = rows.filter((r) => !r.is_member);
  if (q) rows = rows.filter((r) => (r.full_name ?? "").toLowerCase().includes(q) || (r.email ?? "").toLowerCase().includes(q));

  const filters = [
    ["all", "Everyone"],
    ["members", "Members"],
    ["at_risk", "Orange & red"],
    ["new", "New"],
    ["non_members", "Not members"],
  ];

  return (
    <div>
      <PageHeader title="People" intro={`${engagement.length} people · ${engagement.filter((r) => r.is_member).length} members`} />

      <form className="flex flex-wrap gap-2 mb-4 items-center">
        {filters.map(([k, label]) => (
          <Link key={k} href={`/admin/people?flag=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`pill px-3 py-1.5 ${flag === k ? "bg-brand text-white" : "bg-bg-soft text-ink-soft"}`}>
            {label}
          </Link>
        ))}
        <input type="hidden" name="flag" value={flag} />
        <input name="q" defaultValue={q} placeholder="Search name or email" className="input max-w-xs ml-auto" />
      </form>

      <div className="card p-0 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th className="pl-5">Name</th>
              <th>Status</th>
              <th>Flag</th>
              <th>Last class</th>
              <th>30 days</th>
              <th className="pr-5">WhatsApp</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id} className="hover:bg-bg-soft/60">
                <td className="pl-5">
                  <Link href={`/admin/people/${r.user_id}`} className="font-medium text-brand">{r.full_name || r.email}</Link>
                  <div className="text-xs text-ink-soft">{r.email}</div>
                </td>
                <td>{r.is_member ? <span className="pill bg-green-soft text-green">member</span> : <span className="pill bg-bg-soft text-ink-soft">{r.membership_status ?? "guest"}</span>}</td>
                <td><FlagPill flag={r.flag} /></td>
                <td className="text-ink-soft">{r.last_attended_at ? fmtDate(r.last_attended_at, "d MMM") : "—"}</td>
                <td className="text-ink-soft">{r.classes_30d}</td>
                <td className="pr-5 text-ink-soft">{r.whatsapp_opt_in ? "✓" : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center text-ink-soft py-8">Nobody matches.</td></tr>}
          </tbody>
        </table>
      </div>

      {(staff ?? []).length > 0 && (
        <div className="mt-6 card">
          <h2 className="font-semibold text-brand mb-2">Team</h2>
          <ul className="text-sm divide-y divide-line">
            {staff!.map((s) => (
              <li key={s.id} className="py-2 flex justify-between">
                <Link href={`/admin/people/${s.id}`} className="hover:text-brand">{s.full_name || s.email}</Link>
                <span className="pill bg-brand-soft text-brand">{s.role}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
