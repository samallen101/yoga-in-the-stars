-- Yoga in the Stars: core schema
-- Runs on Supabase (Postgres 15+). Auth lives in auth.users; everything here references it.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role as enum ('yogi', 'teacher', 'admin');
create type membership_status as enum ('active', 'paused', 'past_due', 'cancelled', 'incomplete');
create type session_status as enum ('scheduled', 'cancelled', 'completed');
create type pricing_mode as enum ('members_included', 'drop_in', 'pay_what_you_wish', 'free');
create type booking_status as enum ('booked', 'waitlisted', 'cancelled', 'attended', 'no_show');
create type paid_with as enum ('membership', 'class_pass', 'drop_in', 'pay_what_you_wish', 'free', 'comp');
create type order_kind as enum ('membership', 'class_pass', 'drop_in', 'pay_what_you_wish', 'event_ticket', 'donation');
create type order_status as enum ('pending', 'paid', 'refunded', 'failed', 'cancelled');
create type event_status as enum ('draft', 'published', 'cancelled', 'completed');
create type engagement_flag as enum ('green', 'orange', 'red', 'new', 'inactive');

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  whatsapp_opt_in boolean not null default false,
  marketing_opt_in boolean not null default false,
  role user_role not null default 'yogi',
  stripe_customer_id text unique,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on profiles(role);

-- Auto-create a profile row when a user signs up
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Locations (multi-site from day one)
-- ---------------------------------------------------------------------------
create table locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Products: membership plans and class passes
-- ---------------------------------------------------------------------------
create table membership_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_pence integer not null check (price_pence >= 0),
  interval text not null default 'month' check (interval in ('month', 'year')),
  classes_per_period integer,               -- null = unlimited
  stripe_price_id text unique,
  event_discount_percent integer not null default 0 check (event_discount_percent between 0 and 100),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table class_pass_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  credits integer not null check (credits > 0),
  price_pence integer not null check (price_pence >= 0),
  validity_days integer not null default 90,
  stripe_price_id text unique,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Memberships and class passes owned by people
-- ---------------------------------------------------------------------------
create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  plan_id uuid not null references membership_plans(id),
  status membership_status not null default 'incomplete',
  stripe_subscription_id text unique,
  current_period_start timestamptz,
  current_period_end timestamptz,
  paused_until timestamptz,
  cancel_at timestamptz,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index memberships_user_idx on memberships(user_id);
create index memberships_status_idx on memberships(status);

create table class_passes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  product_id uuid references class_pass_products(id),
  credits_total integer not null,
  credits_remaining integer not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index class_passes_user_idx on class_passes(user_id);

-- ---------------------------------------------------------------------------
-- Classes: types and scheduled sessions
-- ---------------------------------------------------------------------------
create table class_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  duration_minutes integer not null default 60,
  colour text not null default '#7c6f9f',
  default_capacity integer not null default 16,
  default_pricing pricing_mode not null default 'members_included',
  default_drop_in_pence integer not null default 1200,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_type_id uuid not null references class_types(id),
  teacher_id uuid references profiles(id),
  location_id uuid references locations(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null default 16,
  pricing pricing_mode not null default 'members_included',
  drop_in_pence integer not null default 1200,
  suggested_pwyw_pence integer,
  status session_status not null default 'scheduled',
  cancel_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index class_sessions_starts_idx on class_sessions(starts_at);
create index class_sessions_teacher_idx on class_sessions(teacher_id);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create table bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references class_sessions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status booking_status not null default 'booked',
  paid_with paid_with not null,
  amount_pence integer not null default 0,
  class_pass_id uuid references class_passes(id),
  membership_id uuid references memberships(id),
  order_id uuid,
  checked_in_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, user_id)
);
create index bookings_user_idx on bookings(user_id);
create index bookings_session_idx on bookings(session_id);

-- ---------------------------------------------------------------------------
-- Events (gigs, breathwork, retreats) with real member pricing
-- ---------------------------------------------------------------------------
create table events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text,
  image_url text,
  location_id uuid references locations(id),
  starts_at timestamptz not null,
  ends_at timestamptz,
  capacity integer,
  status event_status not null default 'draft',
  created_at timestamptz not null default now()
);

create table event_tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  price_pence integer not null check (price_pence >= 0),
  member_price_pence integer,              -- null = members pay the standard price
  members_only boolean not null default false,
  quantity integer,                         -- null = unlimited
  sort_order integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Orders: a single money ledger for everything
-- ---------------------------------------------------------------------------
create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  kind order_kind not null,
  status order_status not null default 'pending',
  amount_pence integer not null default 0,
  currency text not null default 'gbp',
  description text,
  -- what this order is for
  membership_id uuid references memberships(id),
  class_pass_id uuid references class_passes(id),
  session_id uuid references class_sessions(id),
  event_id uuid references events(id),
  event_ticket_id uuid references event_tickets(id),
  quantity integer not null default 1,
  -- stripe references
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_invoice_id text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);
create index orders_user_idx on orders(user_id);
create index orders_kind_idx on orders(kind);

alter table bookings add constraint bookings_order_fk foreign key (order_id) references orders(id);

-- ---------------------------------------------------------------------------
-- Outbox: every business event, forwarded to n8n / WhatsApp / email
-- ---------------------------------------------------------------------------
create table outbox_events (
  id uuid primary key default gen_random_uuid(),
  type text not null,                 -- e.g. membership.purchased, booking.created, session.cancelled
  user_id uuid references profiles(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,          -- forwarded to n8n
  emailed_at timestamptz,            -- transactional email handled by the app
  attempts integer not null default 0,
  last_error text
);
create index outbox_undelivered_idx on outbox_events(created_at) where delivered_at is null;
create index outbox_unemailed_idx on outbox_events(created_at) where emailed_at is null;

-- ---------------------------------------------------------------------------
-- Broadcasts sent by admins
-- ---------------------------------------------------------------------------
create table broadcasts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references profiles(id),
  channel text not null check (channel in ('email', 'whatsapp')),
  audience jsonb not null,            -- the filter that was used
  subject text,
  body text not null,
  recipient_count integer not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Settings (single row)
-- ---------------------------------------------------------------------------
create table settings (
  id integer primary key default 1 check (id = 1),
  club_name text not null default 'Yoga in the Stars',
  whatsapp_community_url text,
  whatsapp_team_numbers text[] not null default '{}',
  booking_cutoff_minutes integer not null default 0,
  cancel_cutoff_hours integer not null default 2,
  orange_after_days integer not null default 10,
  red_after_days integer not null default 21,
  timezone text not null default 'Europe/London',
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger profiles_updated before update on profiles for each row execute function set_updated_at();
create trigger memberships_updated before update on memberships for each row execute function set_updated_at();
create trigger sessions_updated before update on class_sessions for each row execute function set_updated_at();
create trigger orders_updated before update on orders for each row execute function set_updated_at();

-- Role helpers used by RLS
create or replace function current_role_of(uid uuid)
returns user_role language sql stable security definer set search_path = public as $$
  select role from profiles where id = uid
$$;

create or replace function is_staff()
returns boolean language sql stable as $$
  select coalesce(current_role_of(auth.uid()) in ('teacher', 'admin'), false)
$$;

create or replace function is_admin()
returns boolean language sql stable as $$
  select coalesce(current_role_of(auth.uid()) = 'admin', false)
$$;

-- Is this user an active member right now?
create or replace function is_active_member(uid uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from memberships
    where user_id = uid
      and status = 'active'
      and (current_period_end is null or current_period_end > now())
  )
$$;

-- Enqueue an outbox event (used by triggers and server code)
create or replace function emit_event(p_type text, p_user_id uuid, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into outbox_events (type, user_id, payload) values (p_type, p_user_id, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Views: member counts and engagement flags
-- ---------------------------------------------------------------------------
create or replace view session_booking_counts as
select s.id as session_id,
       count(*) filter (where b.status in ('booked', 'attended')) as booked,
       count(*) filter (where b.status = 'waitlisted') as waitlisted
from class_sessions s
left join bookings b on b.session_id = s.id
group by s.id;

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
       ls.last_attended_at,
       coalesce(ls.classes_30d, 0) as classes_30d,
       coalesce(ls.upcoming, 0) as upcoming,
       case
         when not is_active_member(p.id) then 'inactive'::engagement_flag
         when m.started_at > now() - interval '14 days' and ls.last_attended_at is null then 'new'::engagement_flag
         when ls.last_attended_at is null or ls.last_attended_at < now() - (st.red_after_days || ' days')::interval then 'red'::engagement_flag
         when ls.last_attended_at < now() - (st.orange_after_days || ' days')::interval then 'orange'::engagement_flag
         else 'green'::engagement_flag
       end as flag
from profiles p
cross join st
left join lateral (
  select * from memberships where user_id = p.id order by created_at desc limit 1
) m on true
left join last_seen ls on ls.user_id = p.id
where p.role = 'yogi';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table locations enable row level security;
alter table membership_plans enable row level security;
alter table class_pass_products enable row level security;
alter table memberships enable row level security;
alter table class_passes enable row level security;
alter table class_types enable row level security;
alter table class_sessions enable row level security;
alter table bookings enable row level security;
alter table events enable row level security;
alter table event_tickets enable row level security;
alter table orders enable row level security;
alter table outbox_events enable row level security;
alter table broadcasts enable row level security;
alter table settings enable row level security;

-- profiles: you see yourself; staff see everyone; admins edit anyone
create policy "profiles self read" on profiles for select using (id = auth.uid() or is_staff());
create policy "profiles self update" on profiles for update using (id = auth.uid()) with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));
create policy "profiles admin all" on profiles for all using (is_admin()) with check (is_admin());

-- public catalogue: anyone can read active things; admins manage
create policy "locations read" on locations for select using (true);
create policy "locations admin" on locations for all using (is_admin()) with check (is_admin());
create policy "plans read" on membership_plans for select using (active or is_admin());
create policy "plans admin" on membership_plans for all using (is_admin()) with check (is_admin());
create policy "passes read" on class_pass_products for select using (active or is_admin());
create policy "passes admin" on class_pass_products for all using (is_admin()) with check (is_admin());
create policy "class types read" on class_types for select using (true);
create policy "class types admin" on class_types for all using (is_admin()) with check (is_admin());
create policy "sessions read" on class_sessions for select using (true);
create policy "sessions staff write" on class_sessions for all using (is_staff()) with check (is_staff());
create policy "events read" on events for select using (status = 'published' or is_staff());
create policy "events admin" on events for all using (is_admin()) with check (is_admin());
create policy "tickets read" on event_tickets for select using (true);
create policy "tickets admin" on event_tickets for all using (is_admin()) with check (is_admin());

-- ownership tables: yours or staff
create policy "memberships own" on memberships for select using (user_id = auth.uid() or is_staff());
create policy "memberships admin" on memberships for all using (is_admin()) with check (is_admin());
create policy "class passes own" on class_passes for select using (user_id = auth.uid() or is_staff());
create policy "class passes admin" on class_passes for all using (is_admin()) with check (is_admin());
create policy "bookings own" on bookings for select using (user_id = auth.uid() or is_staff());
create policy "bookings staff write" on bookings for all using (is_staff()) with check (is_staff());
create policy "orders own" on orders for select using (user_id = auth.uid() or is_staff());
create policy "orders admin" on orders for all using (is_admin()) with check (is_admin());

-- internal tables: admins only (server code uses the service role and bypasses RLS)
create policy "outbox admin" on outbox_events for all using (is_admin()) with check (is_admin());
create policy "broadcasts admin" on broadcasts for all using (is_admin()) with check (is_admin());
create policy "settings read" on settings for select using (true);
create policy "settings admin" on settings for update using (is_admin()) with check (is_admin());

-- Note: booking creation, checkout and webhook handling go through server
-- actions using the service role key, so they can enforce business rules
-- (capacity, credits, cutoffs, member pricing) in one place.

-- The engagement view contains personal data: only server code (service role) may read it.
revoke all on engagement from anon, authenticated;
-- session_booking_counts is aggregate-only and intentionally runs with owner rights so
-- public schedule pages can show "3 spaces left" without exposing who booked.
grant select on session_booking_counts to anon, authenticated;
