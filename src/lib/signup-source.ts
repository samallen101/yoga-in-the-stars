/**
 * Where a new registration came from, for the ad funnel (post or ad, then
 * WhatsApp, then "Register for free"). Ads, posts and WhatsApp replies link to
 * /register?utm_source=instagram&utm_campaign=autumn-intro (or ?ref=...), the
 * register form carries those values through, and they are kept on the
 * person's account and in the user.registered event, so Admin and the team
 * alert can show which post or ad brought someone in.
 *
 * No cookie and no tracking script: only what is in the link they followed.
 */
export const SOURCE_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "ref"] as const;
export type SignupSource = Partial<Record<(typeof SOURCE_KEYS)[number], string>>;

/** Pick the allowed keys from query params or form data; null when there are none. */
export function pickSource(get: (key: string) => unknown): SignupSource | null {
  const out: SignupSource = {};
  for (const k of SOURCE_KEYS) {
    let v = get(k);
    if (Array.isArray(v)) v = v[0];
    if (typeof v !== "string") continue;
    const clean = v.replace(/[^\p{L}\p{N} ._:/+@-]/gu, "").trim().slice(0, 80);
    if (clean) out[k] = clean;
  }
  return Object.keys(out).length ? out : null;
}

/** "instagram · autumn-intro" style label for Admin. */
export function sourceLabel(src: SignupSource | null | undefined): string | null {
  if (!src) return null;
  const parts = [src.utm_source ?? src.ref, src.utm_campaign, src.utm_content].filter(Boolean);
  if (src.utm_medium && !parts.includes(src.utm_medium)) parts.splice(1, 0, src.utm_medium);
  return parts.length ? parts.join(" · ") : null;
}
