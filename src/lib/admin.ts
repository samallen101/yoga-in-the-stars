import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import type { Views } from "@/lib/database.types";

export type EngagementRow = Views<"engagement">;

export async function getEngagement() {
  const db = createAdminClient();
  const { data } = await db.from("engagement").select("*").order("full_name");
  return (data ?? []) as EngagementRow[];
}

export async function getDashboard() {
  const db = createAdminClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thirtyAgo = new Date(Date.now() - 30 * 86400_000).toISOString();

  const [engagement, { count: joinedThisMonth }, { count: cancelledThisMonth }, { data: recentOrders }, { data: attendance }, { data: recentEvents }] = await Promise.all([
    getEngagement(),
    db.from("memberships").select("id", { count: "exact", head: true }).gte("started_at", monthStart).in("status", ["active", "paused", "past_due"]),
    db.from("memberships").select("id", { count: "exact", head: true }).gte("ended_at", monthStart).eq("status", "cancelled"),
    db.from("orders").select("*, profiles(full_name)").eq("status", "paid").order("paid_at", { ascending: false }).limit(8),
    db
      .from("bookings")
      .select("status, class_sessions!inner(starts_at, class_types(name))")
      .in("status", ["booked", "attended"])
      .gte("class_sessions.starts_at", thirtyAgo)
      .lte("class_sessions.starts_at", now.toISOString()),
    db.from("outbox_events").select("*, profiles(full_name)").order("created_at", { ascending: false }).limit(10),
  ]);

  const members = engagement.filter((e) => e.is_member);
  const flags = { green: 0, orange: 0, red: 0, new: 0 };
  for (const m of members) if (m.flag && m.flag in flags) flags[m.flag as keyof typeof flags]++;

  const byClass = new Map<string, number>();
  for (const b of attendance ?? []) {
    const name = (b.class_sessions as unknown as { class_types: { name: string } }).class_types?.name ?? "?";
    byClass.set(name, (byClass.get(name) ?? 0) + 1);
  }
  const popularClasses = [...byClass.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  const revenue30 = (recentOrders ?? []).reduce((n, o) => n + (o.paid_at && o.paid_at >= thirtyAgo ? o.amount_pence : 0), 0);

  return {
    memberCount: members.length,
    joinedThisMonth: joinedThisMonth ?? 0,
    cancelledThisMonth: cancelledThisMonth ?? 0,
    flags,
    atRisk: members.filter((m) => m.flag === "orange" || m.flag === "red").sort((a) => (a.flag === "red" ? -1 : 1)),
    newMembers: members.filter((m) => m.flag === "new"),
    popularClasses,
    attendance30: attendance?.length ?? 0,
    recentOrders: recentOrders ?? [],
    revenue30,
    recentEvents: recentEvents ?? [],
  };
}
