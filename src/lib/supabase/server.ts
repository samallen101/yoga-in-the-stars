import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

/** Supabase client bound to the current user's cookies. Respects RLS. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component: the proxy refreshes sessions instead.
          }
        },
      },
    },
  );
}

/**
 * Service-role client. Bypasses RLS. Server only.
 * Use for business rules (booking, checkout, webhooks, crons) where the
 * server has to write on behalf of a user or read across users.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Current auth user + profile, or null. */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  return profile ? { user, profile } : null;
}

export async function requireUser() {
  const me = await getCurrentUser();
  if (!me) throw new Error("UNAUTHENTICATED");
  return me;
}

export async function requireRole(...roles: Array<"yogi" | "teacher" | "admin">) {
  const me = await requireUser();
  if (!roles.includes(me.profile.role)) throw new Error("FORBIDDEN");
  return me;
}
