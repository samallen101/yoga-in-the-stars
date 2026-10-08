-- 0010: lock down what the public Supabase API can do (audit, 8 Oct 2026).
--
-- The anon key is public by design (it ships in every page), so anything the
-- `anon` and `authenticated` roles may do through PostgREST is effectively
-- public. The site itself reads and writes through the service role (server
-- code only) and uses the signed-in user's own client just to read their own
-- profile, so none of the changes below affect how the site works.
--
-- 1. emit_event() was executable by anyone. With the public anon key, a
--    stranger could queue any outbox event, including `broadcast.whatsapp`
--    with their own phone number and text, which n8n would then send from the
--    club's WhatsApp number. Only server code may emit events now.
-- 2. The settings row was readable by anyone, including the team's WhatsApp
--    numbers, the test email allowlist and the go-live date. Admins only now
--    (the site reads settings with the service role).
-- 3. Members could update their own profile row directly through the API,
--    including stripe_customer_id (which decides whose Stripe billing portal
--    they are sent to), staff notes, email and the Momo fields. The site's own
--    "update profile" form goes through the server, so the direct route is
--    removed.
-- 4. Teachers ("staff") could read every profile (dates of birth, addresses,
--    phones), every order and the full Momo order archive, and write any class
--    or booking, directly through the API. The teacher pages only need their
--    own classes and already go through the server, so direct API access to
--    other people's data is now admin only.

-- 1 ---------------------------------------------------------------------------
revoke execute on function emit_event(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function emit_event(text, uuid, jsonb) to service_role;

-- 2 ---------------------------------------------------------------------------
drop policy if exists "settings read" on settings;
create policy "settings read" on settings for select using (is_admin());

-- 3 ---------------------------------------------------------------------------
drop policy if exists "profiles self update" on profiles;

-- 4 ---------------------------------------------------------------------------
drop policy if exists "profiles self read" on profiles;
create policy "profiles self read" on profiles for select using (id = auth.uid() or is_admin());

drop policy if exists "memberships own" on memberships;
create policy "memberships own" on memberships for select using (user_id = auth.uid() or is_admin());

drop policy if exists "class passes own" on class_passes;
create policy "class passes own" on class_passes for select using (user_id = auth.uid() or is_admin());

drop policy if exists "bookings own" on bookings;
create policy "bookings own" on bookings for select using (user_id = auth.uid() or is_admin());

drop policy if exists "bookings staff write" on bookings;
drop policy if exists "bookings admin write" on bookings;
create policy "bookings admin write" on bookings for all using (is_admin()) with check (is_admin());

drop policy if exists "orders own" on orders;
create policy "orders own" on orders for select using (user_id = auth.uid() or is_admin());

drop policy if exists "sessions staff write" on class_sessions;
drop policy if exists "sessions admin write" on class_sessions;
create policy "sessions admin write" on class_sessions for all using (is_admin()) with check (is_admin());

drop policy if exists "events read" on events;
create policy "events read" on events for select using (status = 'published' or is_admin());

drop policy if exists "staff read momo orders" on momo_orders;
drop policy if exists "admin read momo orders" on momo_orders;
create policy "admin read momo orders" on momo_orders for select using (is_admin());

-- Insights: the admin page calls this with the service role; signed-in admins may too.
create or replace function momo_insights_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not is_admin() then raise exception 'admin only'; end if;
  select jsonb_build_object(
    'orders', coalesce((
      select jsonb_agg(jsonb_build_array(
        o.invoice_date, o.pricing_option, o.price, o.paid, o.payment_method, o.promo_code,
        o.start_date, o.expiry_date, o.credits, coalesce(o.user_id::text, lower(o.email))
      ) order by o.invoice_date)
      from momo_orders o), '[]'::jsonb),
    'people', coalesce((
      select jsonb_agg(jsonb_build_array(
        p.id::text, p.momo_registered_at, p.momo_status, p.momo_last_class_at,
        (p.phone is not null), p.city, p.postal_code, p.date_of_birth, p.full_name
      ))
      from profiles p where p.momo_id is not null), '[]'::jsonb),
    'generated_at', now()
  ) into v;
  return v;
end $$;
revoke all on function momo_insights_data() from public, anon;
grant execute on function momo_insights_data() to authenticated, service_role;
