import { NextResponse, type NextRequest } from "next/server";
import { flushOutbox } from "@/lib/outbox";
import { sendTransactionalEmails } from "@/lib/notifications";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorised(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}` || req.nextUrl.searchParams.get("secret") === secret;
}

/** Every minute on Vercel: send emails for new events, then forward everything to n8n. */
export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const emails = await sendTransactionalEmails();
  const outbox = await flushOutbox();
  return NextResponse.json({ emails, outbox });
}
