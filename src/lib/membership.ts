import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * The person's imported Momo membership, if they still have one that has not
 * been taken over by a subscription bought here. Imported memberships were
 * active on Momo with a card on file there; nothing renews them on this site,
 * so the person is offered a "move your membership over" step.
 */
export async function legacyMembershipOf(userId: string) {
  const db = createAdminClient();
  const { data } = await db
    .from("memberships")
    .select("id, status, current_period_end, plan_id, membership_plans(name, price_pence, active)")
    .eq("user_id", userId)
    .eq("source", "momo")
    .is("stripe_subscription_id", null)
    .is("replaced_by", null)
    .eq("status", "active")
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** True when the person already has a site subscription lined up (paid, or in its free run-up). */
export async function hasSiteSubscription(userId: string) {
  const db = createAdminClient();
  const { count } = await db
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("stripe_subscription_id", "is", null)
    .in("status", ["active", "paused", "past_due"]);
  return (count ?? 0) > 0;
}
