import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn, sendMagicLink } from "../actions";
import { Notice } from "@/components/ui";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/me";
  const error = typeof sp.error === "string" ? sp.error : null;
  const sent = sp.sent === "1";
  if (await getCurrentUser()) redirect(next);

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-3xl font-semibold text-brand mb-1">Welcome back</h1>
      <p className="text-ink-soft mb-6">Sign in to book classes and manage your membership.</p>

      {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}
      {sent && <div className="mb-4"><Notice kind="success">Check your email for a sign-in link.</Notice></div>}

      <form action={signIn} className="card space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required className="input" autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required className="input" autoComplete="current-password" />
        </div>
        <button className="btn-primary w-full">Sign in</button>
        <button formAction={sendMagicLink} className="btn-ghost w-full">Email me a sign-in link instead</button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-soft">
        New here?{" "}
        <Link href={`/register?next=${encodeURIComponent(next)}`} className="text-brand font-medium">
          Create an account
        </Link>
      </p>
    </div>
  );
}
