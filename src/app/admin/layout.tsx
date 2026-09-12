import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/people", label: "People" },
  { href: "/admin/insights", label: "Insights" },
  { href: "/admin/schedule", label: "Schedule" },
  { href: "/admin/plans", label: "Plans & passes" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/broadcast", label: "Broadcast" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/admin");
  if (me.profile.role !== "admin") redirect("/me");
  return (
    <div className="grid gap-6 lg:grid-cols-[12rem_1fr]">
      <nav className="flex lg:flex-col gap-1 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-xl px-3 py-2 text-sm whitespace-nowrap text-ink-soft hover:bg-bg-soft hover:text-ink">
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
