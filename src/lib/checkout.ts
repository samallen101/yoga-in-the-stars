import "server-only";
import { stripe, siteUrl } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

/** Find or create the Stripe customer for a profile. */
export async function ensureStripeCustomer(profile: Tables<"profiles">) {
  if (profile.stripe_customer_id) return profile.stripe_customer_id;
  const customer = await stripe().customers.create({
    email: profile.email,
    name: profile.full_name ?? undefined,
    phone: profile.phone ?? undefined,
    metadata: { profile_id: profile.id },
  });
  await createAdminClient().from("profiles").update({ stripe_customer_id: customer.id }).eq("id", profile.id);
  return customer.id;
}

/** Drop-in or pay-what-you-wish for a single class. */
export async function checkoutForSession(opts: {
  profile: Tables<"profiles">;
  session: Tables<"class_sessions"> & { class_types: { name: string } };
  amountPence: number;
  kind: "drop_in" | "pay_what_you_wish";
}) {
  const db = createAdminClient();
  const customer = await ensureStripeCustomer(opts.profile);
  const { data: order } = await db
    .from("orders")
    .insert({
      user_id: opts.profile.id,
      kind: opts.kind,
      amount_pence: opts.amountPence,
      session_id: opts.session.id,
      description: `${opts.session.class_types.name} · ${opts.session.starts_at}`,
    })
    .select("id")
    .single();
  if (!order) throw new Error("Could not create order");

  const cs = await stripe().checkout.sessions.create({
    mode: "payment",
    customer,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: opts.amountPence,
          product_data: { name: opts.session.class_types.name, description: opts.kind === "pay_what_you_wish" ? "Pay what you wish" : "Drop-in class" },
        },
      },
    ],
    metadata: { order_id: order.id, kind: opts.kind, session_id: opts.session.id, user_id: opts.profile.id },
    success_url: siteUrl(`/classes/${opts.session.id}?paid=1`),
    cancel_url: siteUrl(`/classes/${opts.session.id}`),
  });
  await db.from("orders").update({ stripe_checkout_session_id: cs.id }).eq("id", order.id);
  return cs.url!;
}

/** Recurring membership subscription. */
export async function checkoutForPlan(profile: Tables<"profiles">, plan: Tables<"membership_plans">) {
  const db = createAdminClient();
  const customer = await ensureStripeCustomer(profile);
  const priceId = await ensurePlanPrice(plan);

  const { data: membership } = await db
    .from("memberships")
    .insert({ user_id: profile.id, plan_id: plan.id, status: "incomplete" })
    .select("id")
    .single();
  const { data: order } = await db
    .from("orders")
    .insert({ user_id: profile.id, kind: "membership", amount_pence: plan.price_pence, membership_id: membership?.id, description: plan.name })
    .select("id")
    .single();

  const cs = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: { metadata: { membership_id: membership!.id, plan_id: plan.id, user_id: profile.id } },
    metadata: { order_id: order!.id, kind: "membership", membership_id: membership!.id, user_id: profile.id },
    success_url: siteUrl(`/me?joined=1`),
    cancel_url: siteUrl(`/membership`),
  });
  await db.from("orders").update({ stripe_checkout_session_id: cs.id }).eq("id", order!.id);
  return cs.url!;
}

/** One-off class pass purchase. */
export async function checkoutForClassPass(profile: Tables<"profiles">, product: Tables<"class_pass_products">) {
  const db = createAdminClient();
  const customer = await ensureStripeCustomer(profile);
  const { data: order } = await db
    .from("orders")
    .insert({ user_id: profile.id, kind: "class_pass", amount_pence: product.price_pence, description: product.name, metadata: { product_id: product.id } })
    .select("id")
    .single();

  const cs = await stripe().checkout.sessions.create({
    mode: "payment",
    customer,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: product.price_pence,
          product_data: { name: product.name, description: `${product.credits} classes, valid ${product.validity_days} days` },
        },
      },
    ],
    allow_promotion_codes: true,
    metadata: { order_id: order!.id, kind: "class_pass", product_id: product.id, user_id: profile.id },
    success_url: siteUrl(`/me?pass=1`),
    cancel_url: siteUrl(`/membership`),
  });
  await db.from("orders").update({ stripe_checkout_session_id: cs.id }).eq("id", order!.id);
  return cs.url!;
}

/** Event ticket, with the member price applied server-side when the buyer is an active member. */
export async function checkoutForEventTicket(opts: {
  profile: Tables<"profiles">;
  event: Tables<"events">;
  ticket: Tables<"event_tickets">;
  quantity: number;
  isMember: boolean;
}) {
  const db = createAdminClient();
  const { profile, event, ticket, quantity, isMember } = opts;
  if (ticket.members_only && !isMember) throw new Error("This ticket is for members only.");
  const unit = isMember && ticket.member_price_pence != null ? ticket.member_price_pence : ticket.price_pence;
  const customer = await ensureStripeCustomer(profile);

  const { data: order } = await db
    .from("orders")
    .insert({
      user_id: profile.id,
      kind: "event_ticket",
      amount_pence: unit * quantity,
      event_id: event.id,
      event_ticket_id: ticket.id,
      quantity,
      description: `${event.title} · ${ticket.name}`,
      metadata: { member_price: isMember && ticket.member_price_pence != null },
    })
    .select("id")
    .single();

  if (unit === 0) {
    // Free ticket: no Stripe needed.
    await db.from("orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", order!.id);
    return siteUrl(`/events/${event.slug}?paid=1`);
  }

  const cs = await stripe().checkout.sessions.create({
    mode: "payment",
    customer,
    line_items: [
      {
        quantity,
        price_data: {
          currency: "gbp",
          unit_amount: unit,
          product_data: { name: `${event.title} · ${ticket.name}${isMember && ticket.member_price_pence != null ? " (member price)" : ""}` },
        },
      },
    ],
    allow_promotion_codes: true,
    metadata: { order_id: order!.id, kind: "event_ticket", event_id: event.id, user_id: profile.id },
    success_url: siteUrl(`/events/${event.slug}?paid=1`),
    cancel_url: siteUrl(`/events/${event.slug}`),
  });
  await db.from("orders").update({ stripe_checkout_session_id: cs.id }).eq("id", order!.id);
  return cs.url!;
}

/** Stripe Customer Portal: update card, pause, cancel. */
export async function portalUrl(profile: Tables<"profiles">) {
  const customer = await ensureStripeCustomer(profile);
  const session = await stripe().billingPortal.sessions.create({ customer, return_url: siteUrl("/me") });
  return session.url;
}

/** Create the Stripe Price for a plan the first time it is sold. */
async function ensurePlanPrice(plan: Tables<"membership_plans">) {
  if (plan.stripe_price_id) return plan.stripe_price_id;
  const product = await stripe().products.create({ name: plan.name, description: plan.description ?? undefined, metadata: { plan_id: plan.id } });
  const price = await stripe().prices.create({
    product: product.id,
    currency: "gbp",
    unit_amount: plan.price_pence,
    recurring: { interval: plan.interval as "month" | "year" },
  });
  await createAdminClient().from("membership_plans").update({ stripe_price_id: price.id }).eq("id", plan.id);
  return price.id;
}
