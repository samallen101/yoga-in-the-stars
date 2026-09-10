import Link from "next/link";
import { redirect } from "next/navigation";
import { signUp } from "../actions";
import { Notice } from "@/components/ui";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/me";
  const error = typeof sp.error === "string" ? sp.error : null;
  const check = sp.check === "1";
  if (await getCurrentUser()) redirect(next);

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-3xl font-semibold text-brand mb-1">Join the club</h1>
      <p className="text-ink-soft mb-6">Create a free account. You only pay when you book or join.</p>

      {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}
      {check && <div className="mb-4"><Notice kind="success">Almost there. Check your email to confirm your account.</Notice></div>}

      <form action={signUp} className="card space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="label" htmlFor="full_name">Your name</label>
          <input id="full_name" name="full_name" required className="input" autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required className="input" autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="phone">Mobile (for WhatsApp updates)</label>
          <input id="phone" name="phone" type="tel" className="input" autoComplete="tel" placeholder="+44 7..." />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required minLength={8} className="input" autoComplete="new-password" />
        </div>
        <label className="flex items-start gap-2 text-sm text-ink-soft">
          <input type="checkbox" name="whatsapp_opt_in" className="mt-1" />
          <span>Message me on WhatsApp about my bookings, class changes and club news. You can opt out any time.</span>
        </label>
        <button className="btn-primary w-full">Create account</button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-soft">
        Already a member?{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-brand font-medium">
          Sign in
        </Link>
      </p>
    </div>
  );
}
