import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { confirmPaidBooking } from "@/lib/booking";
import { emit } from "@/lib/outbox";

export const runtime = "nodejs";

/**
 * Stripe -> us. Everything money-related lands here and is turned into
 * memberships, class passes, bookings, tickets and outbox events.
 */
export async function POST(request: NextRequest) {
  const sig = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await request.text(), sig, secret);
  } catch (err) {
    return NextResponse.json({ error: `invalid signature: ${String(err)}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await onCheckoutCompleted(event.data.object);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.created":
        await syncSubscription(event.data.object);
        break;
      case "customer.subscription.deleted":
        await onSubscriptionDeleted(event.data.object);
        break;
      case "invoice.paid":
        await onInvoicePaid(event.data.object);
        break;
      case "invoice.payment_failed":
        await onInvoiceFailed(event.data.object);
        break;
      case "charge.refunded":
        await onRefund(event.data.object);
        break;
    }
  } catch (err) {
    console.error("[stripe webhook]", event.type, err);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}

async function onCheckoutCompleted(cs: Stripe.Checkout.Session) {
  const db = createAdminClient();
  const orderId = cs.metadata?.order_id;
  if (!orderId) return;
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).single();
  if (!order || order.status === "paid") return;

  const paymentIntent = typeof cs.payment_intent === "string" ? cs.payment_intent : cs.payment_intent?.id ?? null;
  await db
    .from("orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      amount_pence: cs.amount_total ?? order.amount_pence,
      stripe_payment_intent_id: paymentIntent,
    })
    .eq("id", orderId);

  switch (order.kind) {
    case "drop_in":
    case "pay_what_you_wish":
      await confirmPaidBooking(orderId);
      break;

    case "class_pass": {
      const productId = (order.metadata as { product_id?: string })?.product_id;
      const { data: product } = productId ? await db.from("class_pass_products").select("*").eq("id", productId).single() : { data: null };
      if (!product || !order.user_id) break;
      const expires = new Date(Date.now() + product.validity_days * 86400_000).toISOString();
      const { data: pass } = await db
        .from("class_passes")
        .insert({ user_id: order.user_id, product_id: product.id, credits_total: product.credits, credits_remaining: product.credits, expires_at: expires })
        .select("id")
        .single();
      await db.from("orders").update({ class_pass_id: pass?.id }).eq("id", orderId);
      await emit("class_pass.purchased", order.user_id, { product: product.name, credits: product.credits, expires_at: expires, amount_pence: order.amount_pence });
      break;
    }

    case "membership": {
      // The subscription events carry the real state; here we just link the subscription id.
      const subId = typeof cs.subscription === "string" ? cs.subscription : cs.subscription?.id;
      if (order.membership_id && subId) {
        await db.from("memberships").update({ stripe_subscription_id: subId }).eq("id", order.membership_id);
        const sub = await stripe().subscriptions.retrieve(subId);
        await syncSubscription(sub, true);
      }
      break;
    }

    case "event_ticket": {
      const { data: ev } = order.event_id ? await db.from("events").select("title, starts_at, slug").eq("id", order.event_id).single() : { data: null };
      await emit("event_ticket.purchased", order.user_id, {
        event: ev?.title,
        starts_at: ev?.starts_at,
        quantity: order.quantity,
        amount_pence: order.amount_pence,
        member_price: (order.metadata as { member_price?: boolean })?.member_price ?? false,
      });
      break;
    }
  }
}

function periodOf(sub: Stripe.Subscription) {
  const item = sub.items.data[0];
  const start = (item as unknown as { current_period_start?: number })?.current_period_start ?? (sub as unknown as { current_period_start?: number }).current_period_start;
  const end = (item as unknown as { current_period_end?: number })?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  return {
    start: start ? new Date(start * 1000).toISOString() : null,
    end: end ? new Date(end * 1000).toISOString() : null,
  };
}

function mapStatus(sub: Stripe.Subscription): "active" | "paused" | "past_due" | "cancelled" | "incomplete" {
  if (sub.pause_collection) return "paused";
  switch (sub.status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "cancelled";
    default:
      return "incomplete";
  }
}

async function syncSubscription(sub: Stripe.Subscription, fromCheckout = false) {
  const db = createAdminClient();
  const membershipId = sub.metadata?.membership_id;
  const { data: membership } = membershipId
    ? await db.from("memberships").select("*, membership_plans(name)").eq("id", membershipId).single()
    : await db.from("memberships").select("*, membership_plans(name)").eq("stripe_subscription_id", sub.id).single();
  if (!membership) return;

  const prev = membership.status;
  const status = mapStatus(sub);
  const period = periodOf(sub);
  const resumesAt = sub.pause_collection?.resumes_at ? new Date(sub.pause_collection.resumes_at * 1000).toISOString() : null;

  await db
    .from("memberships")
    .update({
      status,
      stripe_subscription_id: sub.id,
      current_period_start: period.start,
      current_period_end: period.end,
      paused_until: status === "paused" ? resumesAt : null,
      cancel_at: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
      ended_at: status === "cancelled" ? new Date().toISOString() : null,
    })
    .eq("id", membership.id);

  const planName = (membership.membership_plans as { name: string }).name;
  if (prev !== "active" && status === "active" && (fromCheckout || prev === "incomplete")) {
    await emit("membership.purchased", membership.user_id, { plan: planName, membership_id: membership.id, period_end: period.end });
  } else if (prev !== "paused" && status === "paused") {
    await emit("membership.paused", membership.user_id, { plan: planName, resumes_at: resumesAt });
  } else if (prev === "paused" && status === "active") {
    await emit("membership.resumed", membership.user_id, { plan: planName });
  } else if (prev !== "cancelled" && status === "cancelled") {
    await emit("membership.cancelled", membership.user_id, { plan: planName });
  } else if (sub.cancel_at && !membership.cancel_at) {
    await emit("membership.cancel_scheduled", membership.user_id, { plan: planName, cancel_at: new Date(sub.cancel_at * 1000).toISOString() });
  }
}

async function onSubscriptionDeleted(sub: Stripe.Subscription) {
  const db = createAdminClient();
  const { data: membership } = await db.from("memberships").select("id, user_id, status, membership_plans(name)").eq("stripe_subscription_id", sub.id).single();
  if (!membership) return;
  await db.from("memberships").update({ status: "cancelled", ended_at: new Date().toISOString() }).eq("id", membership.id);
  if (membership.status !== "cancelled") {
    await emit("membership.cancelled", membership.user_id, { plan: (membership.membership_plans as { name: string }).name });
  }
}

async function onInvoicePaid(inv: Stripe.Invoice) {
  const db = createAdminClient();
  const subId = subscriptionIdOf(inv);
  if (!subId) return;
  const { data: membership } = await db.from("memberships").select("id, user_id, membership_plans(name)").eq("stripe_subscription_id", subId).single();
  if (!membership) return;
  if (inv.billing_reason === "subscription_cycle") {
    await db.from("orders").insert({
      user_id: membership.user_id,
      kind: "membership",
      status: "paid",
      amount_pence: inv.amount_paid,
      membership_id: membership.id,
      stripe_invoice_id: inv.id,
      description: `Renewal · ${(membership.membership_plans as { name: string }).name}`,
      paid_at: new Date().toISOString(),
    });
    await emit("membership.renewed", membership.user_id, { plan: (membership.membership_plans as { name: string }).name, amount_pence: inv.amount_paid });
  }
  const sub = await stripe().subscriptions.retrieve(subId);
  await syncSubscription(sub);
}

async function onInvoiceFailed(inv: Stripe.Invoice) {
  const db = createAdminClient();
  const subId = subscriptionIdOf(inv);
  if (!subId) return;
  const { data: membership } = await db.from("memberships").select("id, user_id, membership_plans(name)").eq("stripe_subscription_id", subId).single();
  if (!membership) return;
  await db.from("memberships").update({ status: "past_due" }).eq("id", membership.id);
  await emit("membership.payment_failed", membership.user_id, { plan: (membership.membership_plans as { name: string }).name, amount_pence: inv.amount_due });
}

async function onRefund(charge: Stripe.Charge) {
  const db = createAdminClient();
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!pi) return;
  const { data: order } = await db.from("orders").select("id, user_id, kind").eq("stripe_payment_intent_id", pi).maybeSingle();
  if (!order) return;
  await db.from("orders").update({ status: "refunded" }).eq("id", order.id);
  await emit("order.refunded", order.user_id, { order_id: order.id, kind: order.kind, amount_pence: charge.amount_refunded });
}

function subscriptionIdOf(inv: Stripe.Invoice): string | null {
  const parent = (inv as unknown as { parent?: { subscription_details?: { subscription?: string | { id: string } } } }).parent;
  const fromParent = parent?.subscription_details?.subscription;
  if (typeof fromParent === "string") return fromParent;
  if (fromParent && typeof fromParent === "object") return fromParent.id;
  const legacy = (inv as unknown as { subscription?: string | { id: string } }).subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object") return legacy.id;
  return null;
}
