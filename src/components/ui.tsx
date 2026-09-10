import Link from "next/link";
import type { ReactNode } from "react";
import type { Enums } from "@/lib/database.types";

export function PageHeader({ title, intro, action }: { title: string; intro?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold text-brand">{title}</h1>
        {intro && <p className="mt-1 text-ink-soft max-w-2xl">{intro}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card text-center text-ink-soft py-10">{children}</div>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: "green" | "orange" | "red" }) {
  const toneClass = tone === "green" ? "text-green" : tone === "orange" ? "text-orange" : tone === "red" ? "text-red" : "text-brand";
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-ink-soft">{label}</div>
      <div className={`mt-1 text-3xl font-semibold serif ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-soft">{hint}</div>}
    </div>
  );
}

export function FlagPill({ flag }: { flag: Enums<"engagement_flag"> | null }) {
  const map: Record<string, string> = {
    green: "bg-green-soft text-green",
    orange: "bg-orange-soft text-orange",
    red: "bg-red-soft text-red",
    new: "bg-accent-soft text-orange",
    inactive: "bg-bg-soft text-ink-soft",
  };
  const f = flag ?? "inactive";
  return <span className={`pill ${map[f]}`}>{f}</span>;
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-green-soft text-green",
    paid: "bg-green-soft text-green",
    booked: "bg-green-soft text-green",
    attended: "bg-brand-soft text-brand",
    published: "bg-green-soft text-green",
    scheduled: "bg-green-soft text-green",
    paused: "bg-orange-soft text-orange",
    past_due: "bg-orange-soft text-orange",
    pending: "bg-orange-soft text-orange",
    waitlisted: "bg-orange-soft text-orange",
    draft: "bg-bg-soft text-ink-soft",
    cancelled: "bg-red-soft text-red",
    no_show: "bg-red-soft text-red",
    refunded: "bg-red-soft text-red",
    failed: "bg-red-soft text-red",
    incomplete: "bg-bg-soft text-ink-soft",
    completed: "bg-bg-soft text-ink-soft",
  };
  return <span className={`pill ${map[status] ?? "bg-bg-soft text-ink-soft"}`}>{status.replace("_", " ")}</span>;
}

export function Notice({ kind = "info", children }: { kind?: "info" | "success" | "error"; children: ReactNode }) {
  const cls = kind === "success" ? "bg-green-soft text-green" : kind === "error" ? "bg-red-soft text-red" : "bg-brand-soft text-brand";
  return <div className={`rounded-xl px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-sm text-ink-soft hover:text-ink">
      ← {children}
    </Link>
  );
}
