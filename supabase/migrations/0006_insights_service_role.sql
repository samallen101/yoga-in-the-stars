-- The Insights page reads through the service role (the page itself is admin-gated),
-- so let the service role through as well as staff users.
create or replace function momo_insights_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not is_staff() then raise exception 'staff only'; end if;
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
