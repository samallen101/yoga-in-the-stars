import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Launch gate for member messages. Before settings.member_messages_live_from
 * (or while it is empty) the site only messages addresses on the test
 * allowlist. Everything else is held: dropped and logged, never queued.
 *
 * Added 22 Sep 2026 after move-over emails reached five real members before
 * the switch-over. Nothing member-facing should bypass this.
 */
export type Gate = { live: boolean; liveFrom: string | null; allowlist: string[] };

let cache: { at: number; gate: Gate } | null = null;

export async function getGate(): Promise<Gate> {
  if (cache && Date.now() - cache.at < 30_000) return cache.gate;
  const { data } = await createAdminClient()
    .from("settings")
    .select("member_messages_live_from, message_test_allowlist")
    .eq("id", 1)
    .single();
  const liveFrom = data?.member_messages_live_from ?? null;
  const gate: Gate = {
    liveFrom,
    live: !!liveFrom && Date.parse(liveFrom) <= Date.now(),
    allowlist: (data?.message_test_allowlist ?? []).map((a: string) => a.trim().toLowerCase()).filter(Boolean),
  };
  cache = { at: Date.now(), gate };
  return gate;
}

/** May this address be messaged right now? Fails closed if settings can't be read. */
export async function mayMessage(address: string): Promise<boolean> {
  try {
    const g = await getGate();
    return g.live || g.allowlist.includes(address.trim().toLowerCase());
  } catch {
    return false;
  }
}

/** True only once member messages are live (for jobs aimed at real members, like move-over nudges). */
export async function membersLive(): Promise<boolean> {
  try {
    return (await getGate()).live;
  } catch {
    return false;
  }
}
