import { NextResponse, type NextRequest } from "next/server";
import { runHealthChecks } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health check for the uptime monitor (n8n polls this every few minutes).
 * Public but reveals nothing sensitive: only pass/fail per component.
 * 200 when everything is fine, 503 when something needs a human.
 *   GET /api/health            summary
 *   GET /api/health?verbose=1  adds timings
 */
export async function GET(req: NextRequest) {
  const verbose = req.nextUrl.searchParams.get("verbose") === "1";
  const h = await runHealthChecks();
  const body = { ...h, checks: verbose ? h.checks : h.checks.map(({ name, ok, warn, detail }) => ({ name, ok, warn, detail })) };
  return NextResponse.json(body, { status: h.status === "problem" ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
