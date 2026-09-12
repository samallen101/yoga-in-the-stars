import { requireRole } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Admin-only: throws on purpose so Sentry can be checked end to end. */
export async function GET() {
  await requireRole("admin");
  throw new Error("Sentry test error from Yoga in the Stars (deliberate)");
}
