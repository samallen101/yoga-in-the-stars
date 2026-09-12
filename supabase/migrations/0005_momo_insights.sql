-- 0005: one call that returns everything Admin → Insights needs, slim and fast.
-- Staff only (checked inside), so the page never has to page through 10k rows.

create or replace function momo_insights_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not is_staff() then raise exception 'staff only'; end if;
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

revoke all on function momo_insights_data() from public;
grant execute on function momo_insights_data() to authenticated, service_role;
