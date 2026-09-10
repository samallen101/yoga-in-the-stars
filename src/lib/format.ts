import { formatInTimeZone } from "date-fns-tz";

export const TZ = "Europe/London";

export function gbp(pence: number) {
  if (pence === 0) return "Free";
  const whole = pence % 100 === 0;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(pence / 100);
}

export function fmtDate(iso: string, pattern = "EEE d MMM") {
  return formatInTimeZone(new Date(iso), TZ, pattern);
}

export function fmtTime(iso: string) {
  return formatInTimeZone(new Date(iso), TZ, "HH:mm");
}

export function fmtDateTime(iso: string) {
  return formatInTimeZone(new Date(iso), TZ, "EEE d MMM, HH:mm");
}

export function dayKey(iso: string) {
  return formatInTimeZone(new Date(iso), TZ, "yyyy-MM-dd");
}

export function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}
