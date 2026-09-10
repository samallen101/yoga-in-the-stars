import Link from "next/link";
import type { Session } from "@/lib/booking";
import { fmtDate, fmtTime, gbp } from "@/lib/format";

export function pricingLabel(s: Session) {
  switch (s.pricing) {
    case "free": return "Free";
    case "pay_what_you_wish": return "Pay what you wish";
    case "drop_in": return `${gbp(s.drop_in_pence)} drop-in`;
    default: return `Members · ${gbp(s.drop_in_pence)} drop-in`;
  }
}

export function SessionCard({ session: s, compact = false }: { session: Session; compact?: boolean }) {
  const spaces = Math.max(0, s.capacity - s.booked);
  const cancelled = s.status === "cancelled";
  return (
    <Link href={`/classes/${s.id}`} className={`card block hover:border-brand/40 transition ${cancelled ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {!compact && <div className="text-xs text-ink-soft">{fmtDate(s.starts_at)}</div>}
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: s.class_types.colour }} />
            <h3 className="font-semibold text-ink truncate">{s.class_types.name}</h3>
          </div>
          <div className="text-sm text-ink-soft mt-0.5">
            {fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}
            {s.teacher?.full_name && ` · ${s.teacher.full_name}`}
          </div>
        </div>
        <div className="text-right shrink-0">
          {cancelled ? (
            <span className="pill bg-red-soft text-red">Cancelled</span>
          ) : spaces === 0 ? (
            <span className="pill bg-orange-soft text-orange">Waitlist</span>
          ) : spaces <= 3 ? (
            <span className="pill bg-orange-soft text-orange">{spaces} left</span>
          ) : (
            <span className="pill bg-green-soft text-green">Open</span>
          )}
        </div>
      </div>
      <div className="mt-3 text-xs text-ink-soft">{pricingLabel(s)}{s.locations?.name ? ` · ${s.locations.name}` : ""}</div>
    </Link>
  );
}
