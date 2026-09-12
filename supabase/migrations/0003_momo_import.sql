-- 0003: everything needed to carry the Momoyoga data across.
-- Adds the extra profile fields Momo held, an archive of every Momo order,
-- hidden legacy plans for people on old deals, and teaches the engagement
-- view about Momo's "last class" date so flags are right from day one.

-- ---------------------------------------------------------------------------
-- Profiles: fields Momo had that we did not
-- ---------------------------------------------------------------------------
alter table profiles
  add column if not exists source text not null default 'site',          -- 'site' | 'momo'
  add column if not exists date_of_birth date,
  add column if not exists gender text,
  add column if not exists address_line text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists momo_id integer unique,
  add column if not exists momo_registered_at date,
  add column if not exists momo_status text,                              -- 'Active' | 'Not-active'
  add column if not exists momo_last_class_at date,
  add column if not exists momo_orders_summary text;                      -- Momo's own "current options" text

create index if not exists profiles_source_idx on profiles(source);
create index if not exists profiles_momo_last_class_idx on profiles(momo_last_class_at);

-- ---------------------------------------------------------------------------
-- Every Momo order, exactly as exported (plus a link to the person)
-- ---------------------------------------------------------------------------
create table if not exists momo_orders (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id) on delete set null,
  invoice_date date,
  first_name text,
  last_name text,
  email text,
  pricing_option text,
  currency text,
  price numeric(10,2),
  tax_percent numeric(6,2),
  tax numeric(10,2),
  price_ex_tax numeric(10,2),
  promo_code text,
  discount_value numeric(10,2),
  price_for_yogi numeric(10,2),
  fee numeric(10,2),
  ex_fee numeric(10,2),
  paid boolean,
  payment_date date,
  payment_method text,
  payment_id text,
  credits integer,
  start_date date,
  expiry_date date,
  invoice_number text,
  reminded integer,
  payout_date date,
  raw jsonb not null,
  imported_at timestamptz not null default now()
);
create index if not exists momo_orders_user_idx on momo_orders(user_id);
create index if not exists momo_orders_email_idx on momo_orders(lower(email));
create index if not exists momo_orders_invoice_date_idx on momo_orders(invoice_date);
create unique index if not exists momo_orders_invoice_number_idx on momo_orders(invoice_number) where invoice_number is not null and invoice_number <> '';

alter table momo_orders enable row level security;
create policy "staff read momo orders" on momo_orders for select using (is_staff());

-- ---------------------------------------------------------------------------
-- Legacy plans: hidden from the shop (active = false) but valid for people
-- who are on them. Prices as in Momo.
-- ---------------------------------------------------------------------------
insert into membership_plans (name, description, price_pence, interval, classes_per_period, event_discount_percent, sort_order, active)
select * from (values
  ('Couples Special Offer Membership'::text, 'Legacy couples deal carried over from Momo.'::text, 6900, 'month'::text, null::integer, 100, 20, false),
  ('Couples partner', 'Second half of a couples membership. Carried over from Momo.', 0, 'month', null, 100, 21, false),
  ('Founder member', 'Legacy founder deal (3 month membership). Carried over from Momo.', 3300, 'month', null, 100, 22, false),
  ('Pay as you wish (legacy £50)', 'Legacy pay as you wish tier. Carried over from Momo.', 5000, 'month', null, 100, 23, false),
  ('Special offer 44', 'Legacy special offer. Carried over from Momo.', 4400, 'month', null, 100, 24, false),
  ('Yoga teacher', 'Yoga teachers come for free. Carried over from Momo.', 0, 'month', null, 100, 30, false),
  ('Home member', 'Special home member (free). Carried over from Momo.', 0, 'month', null, 100, 31, false),
  ('Gold star', 'Gold star (free). Carried over from Momo.', 0, 'month', null, 100, 32, false),
  ('YTT unlimited pass', 'Natures Rhythm yoga teacher training unlimited pass (free).', 0, 'month', null, 100, 33, false),
  ('Karma yogi', 'Karma yogi 3 to 4 months (free). Carried over from Momo.', 0, 'month', null, 100, 34, false),
  ('Guest list', 'Members guest list / friends and family (free). Carried over from Momo.', 0, 'month', null, 100, 35, false),
  ('Momo legacy membership', 'Any other Momo membership option not listed separately.', 0, 'month', null, 100, 39, false)
) as v(name, description, price_pence, interval, classes_per_period, event_discount_percent, sort_order, active)
where not exists (select 1 from membership_plans p where p.name = v.name);

-- Momo's Standard tier was £79, not £75. Align the shop price.
update membership_plans set price_pence = 7900 where name = 'Standard' and price_pence = 7500;

-- Class pass products that exist in Momo and may still be held
insert into class_pass_products (name, description, credits, price_pence, validity_days, sort_order, active)
select * from (values
  ('Three Moon Pass'::text, 'Three classes. Carried over from Momo.'::text, 3, 3330, 90, 10, false),
  ('Full Moon Rituals + Special Events', 'Carried over from Momo.', 1, 2200, 90, 11, false),
  ('10 Class Pass', 'Ten classes including rituals and special events. Carried over from Momo.', 10, 6500, 180, 12, false),
  ('Momo legacy pass', 'Any other Momo class pass not listed separately.', 1, 0, 90, 19, false)
) as v(name, description, credits, price_pence, validity_days, sort_order, active)
where not exists (select 1 from class_pass_products p where p.name = v.name);

-- ---------------------------------------------------------------------------
-- Engagement: fall back to Momo's last class date
-- ---------------------------------------------------------------------------
create or replace view engagement as
with last_seen as (
  select b.user_id,
         max(s.starts_at) filter (where b.status in ('booked', 'attended') and s.starts_at <= now()) as last_attended_at,
         count(*) filter (where b.status in ('booked', 'attended') and s.starts_at > now() - interval '30 days' and s.starts_at <= now()) as classes_30d,
         count(*) filter (where b.status in ('booked') and s.starts_at > now()) as upcoming
  from bookings b
  join class_sessions s on s.id = b.session_id
  group by b.user_id
), st as (select orange_after_days, red_after_days from settings where id = 1)
select p.id as user_id,
       p.full_name,
       p.email,
       p.phone,
       p.whatsapp_opt_in,
       is_active_member(p.id) as is_member,
       m.status as membership_status,
       m.started_at as member_since,
       greatest(ls.last_attended_at, p.momo_last_class_at::timestamptz) as last_attended_at,
       coalesce(ls.classes_30d, 0) as classes_30d,
       coalesce(ls.upcoming, 0) as upcoming,
       case
         when not is_active_member(p.id) then 'inactive'::engagement_flag
         when m.started_at > now() - interval '14 days' and greatest(ls.last_attended_at, p.momo_last_class_at::timestamptz) is null then 'new'::engagement_flag
         when greatest(ls.last_attended_at, p.momo_last_class_at::timestamptz) is null
              or greatest(ls.last_attended_at, p.momo_last_class_at::timestamptz) < now() - (st.red_after_days || ' days')::interval then 'red'::engagement_flag
         when greatest(ls.last_attended_at, p.momo_last_class_at::timestamptz) < now() - (st.orange_after_days || ' days')::interval then 'orange'::engagement_flag
         else 'green'::engagement_flag
       end as flag
from profiles p
cross join st
left join lateral (
  select * from memberships where user_id = p.id order by created_at desc limit 1
) m on true
left join last_seen ls on ls.user_id = p.id
where p.role = 'yogi';
