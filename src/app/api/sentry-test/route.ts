import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Admin-only: throws on purpose so Sentry can be checked end to end. */
export async function GET() {
  const me = await getCurrentUser();
  if (me?.profile.role !== "admin") return NextResponse.json({ error: "admin only" }, { status: 401 });
  throw new Error("Sentry test error from Yoga in the Stars (deliberate)");
}
