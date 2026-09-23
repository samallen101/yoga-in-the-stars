import "server-only";
import { Resend } from "resend";
import { mayMessage } from "@/lib/gate";

/**
 * Transactional email. If RESEND_API_KEY is missing (local dev) the email is
 * logged instead of sent, so nothing breaks before the account exists.
 */
export async function sendEmail(opts: { to: string; subject: string; text: string; html?: string }): Promise<{ ok: boolean; dev?: boolean; held?: boolean; error?: unknown }> {
  // Launch gate: before go-live only allowlisted test addresses get anything.
  if (!(await mayMessage(opts.to))) {
    console.log(`[email:held] to=${opts.to} subject=${opts.subject}`);
    return { ok: true, held: true };
  }
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM || "Yoga in the Stars <onboarding@resend.dev>";
  if (!key || key.endsWith("...")) {
    console.log(`[email:dev] to=${opts.to} subject=${opts.subject}\n${opts.text}`);
    return { ok: true, dev: true };
  }
  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html ?? `<div style="font-family:system-ui,sans-serif;line-height:1.5;max-width:560px">${opts.text.split("\n").map((l) => `<p>${l || "&nbsp;"}</p>`).join("")}</div>`,
  });
  if (error) {
    console.error("[email]", error);
    return { ok: false, error };
  }
  return { ok: true };
}
