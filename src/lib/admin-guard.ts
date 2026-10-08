import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * Every admin page calls this itself. The check in app/admin/layout.tsx is not
 * enough on its own: Next renders route segments independently (a layout is
 * not re-run on client navigation and does not stop the page from rendering),
 * so a page that reads member data with the service role must check the role
 * close to that data. See node_modules/next/dist/docs/01-app/02-guides/authentication.md
 * ("Layouts and auth checks").
 */
export async function requireAdminPage(next = "/admin") {
  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (me.profile.role !== "admin") redirect("/me");
  return me;
}
