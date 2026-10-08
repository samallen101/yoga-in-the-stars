import "server-only";

/**
 * Hard stop on everything that reaches people or costs money (8 Oct 2026).
 *
 * The club hasn't approved anything going out yet, so by default the site
 * sends nothing and spends nothing, whatever the settings table or the test
 * allowlist say:
 *
 *   - no email (Resend) to anyone, test addresses included;
 *   - nothing forwarded to n8n, so no WhatsApp messages or team pings;
 *   - no Stripe calls with a live key, so no real money is taken or refunded.
 *     Test-mode keys (sk_test_) keep working for practice bookings.
 *
 * To switch on later, set these in Vercel and redeploy (each one on its own):
 *   OUTBOUND_ENABLED=yes   email and n8n/WhatsApp
 *   PAYMENTS_LIVE=yes      live Stripe keys
 */
export function outboundEnabled(): boolean {
  return (process.env.OUTBOUND_ENABLED ?? "").trim().toLowerCase() === "yes";
}

export function livePaymentsEnabled(): boolean {
  return (process.env.PAYMENTS_LIVE ?? "").trim().toLowerCase() === "yes";
}

export function isLiveStripeKey(key: string | undefined): boolean {
  const k = (key ?? "").trim();
  return k.startsWith("sk_live_") || k.startsWith("rk_live_");
}
