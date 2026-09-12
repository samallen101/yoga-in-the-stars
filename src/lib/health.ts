import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

/** The checks behind /api/health and Admin → Health. */
export type Check = { name: string; ok: boolean; warn?: boolean; detail: string; ms?: number };

export async function runHealthChecks(): Promise<{ status: string; checked_at: string; total_ms: number; checks: Check[] }> {
  const checks: Check[] = [];
  const t0 = Date.now();

  // 1. Database answers and the settings row exists
  try {
    const db = createAdminClient();
    const t = Date.now();
    const { data, error } = await db.from("settings").select("club_name").eq("id", 1).single();
    if (error) throw error;
    checks.push({ name: "database", ok: true, detail: `answered for ${data.club_name}`, ms: Date.now() - t });
  } catch (e) {
    checks.push({ name: "database", ok: false, detail: `no answer: ${String((e as Error).message ?? e).slice(0, 120)}` });
  }

  // 2. Outbox is being drained (n8n tick + cron). Oldest undelivered event should be young.
  try {
    const db = createAdminClient();
    const { data: oldest } = await db.from("outbox_events").select("created_at").is("delivered_at", null).lt("attempts", 10).order("created_at").limit(1).maybeSingle();
    const { data: last } = await db.from("outbox_events").select("delivered_at").not("delivered_at", "is", null).order("delivered_at", { ascending: false }).limit(1).maybeSingle();
    const { count: stuck } = await db.from("outbox_events").select("id", { count: "exact", head: true }).is("delivered_at", null).gte("attempts", 10);
    const ageMin = oldest ? (Date.now() - Date.parse(oldest.created_at)) / 60000 : 0;
    const lastMin = last?.delivered_at ? Math.round((Date.now() - Date.parse(last.delivered_at)) / 60000) : null;
    const ok = ageMin < 10;
    checks.push({
      name: "automations", ok, warn: ok && (stuck ?? 0) > 0,
      detail: `${oldest ? `oldest waiting event is ${Math.round(ageMin)} min old` : "nothing waiting"}; last delivery ${lastMin === null ? "never" : `${lastMin} min ago`}${stuck ? `; ${stuck} event(s) gave up after 10 tries` : ""}`,
    });
  } catch (e) {
    checks.push({ name: "automations", ok: false, detail: String((e as Error).message ?? e).slice(0, 120) });
  }

  // 3. Payments configured (does not call Stripe; just that the keys are there and match each other)
  {
    const sk = process.env.STRIPE_SECRET_KEY || "", pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "", wh = process.env.STRIPE_WEBHOOK_SECRET || "";
    const mode = sk.startsWith("sk_live") ? "live" : sk.startsWith("sk_test") ? "test" : "missing";
    const consistent = mode !== "missing" && pk.startsWith(mode === "live" ? "pk_live" : "pk_test") && wh.startsWith("whsec_");
    checks.push({ name: "payments", ok: consistent, warn: consistent && mode === "test", detail: consistent ? `Stripe keys set (${mode} mode)` : "Stripe keys missing or mismatched" });
  }

  // 4. n8n reachable
  {
    const base = (process.env.N8N_WEBHOOK_URL || "").replace(/\/webhook\/.*$/, "");
    if (!base) checks.push({ name: "n8n", ok: false, detail: "N8N_WEBHOOK_URL not set" });
    else {
      const t = Date.now();
      try {
        const r = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
        checks.push({ name: "n8n", ok: r.ok, detail: r.ok ? "n8n answered" : `n8n responded ${r.status}`, ms: Date.now() - t });
      } catch (e) {
        checks.push({ name: "n8n", ok: false, detail: `n8n unreachable: ${String((e as Error).name ?? e)}` });
      }
    }
  }

  // 5. Email configured
  checks.push({ name: "email", ok: true, warn: !process.env.RESEND_API_KEY, detail: process.env.RESEND_API_KEY ? "Resend key set" : "no email provider yet: emails are logged, not sent" });

  const ok = checks.every((c) => c.ok);
  return {
    status: ok ? (checks.some((c) => c.warn) ? "ok-with-warnings" : "ok") : "problem",
    checked_at: new Date().toISOString(),
    total_ms: Date.now() - t0,
    checks,
  };
}
