/**
 * Where to send someone after signing in or registering. Only paths on this
 * site: "//evil.example" and "/\evil.example" are both treated by browsers as
 * another host, and full URLs are refused outright.
 */
export function safeNext(v: unknown, fallback = "/me"): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s.startsWith("/") || s.startsWith("//") || s.startsWith("/\\") || /[\r\n]/.test(s)) return fallback;
  return s;
}
