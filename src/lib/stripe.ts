import Stripe from "stripe";
import { isLiveStripeKey, livePaymentsEnabled } from "@/lib/pause";

let _stripe: Stripe | null = null;

export function stripe() {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    // Hard stop (src/lib/pause.ts): no real money moves until PAYMENTS_LIVE=yes.
    if (isLiveStripeKey(key) && !livePaymentsEnabled()) {
      throw new Error("Payments are paused: live Stripe keys are blocked until PAYMENTS_LIVE=yes");
    }
    _stripe = new Stripe(key, { typescript: true });
  }
  return _stripe;
}

export function siteUrl(path = "") {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return base + path;
}
