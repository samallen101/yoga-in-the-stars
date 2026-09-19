-- 0007: "move your membership over" for people imported from Momo.
-- Imported memberships have no Stripe subscription behind them, so when their
-- current Momo period ends nothing renews. We mark where each membership came
-- from, let a new Stripe subscription replace a legacy one (starting when the
-- paid period ends, so nobody pays twice), and remember who has been nudged.

alter table memberships
  add column if not exists source text not null default 'site',
  add column if not exists replaced_by uuid references memberships(id),
  add column if not exists transfer_nudged_at timestamptz;

comment on column memberships.source is 'site = bought or granted here; momo = imported from Momo (no Stripe subscription)';
comment on column memberships.replaced_by is 'The site membership that took over from this legacy one';

-- Everything imported on 12 Sep 2026 belongs to a Momo person and predates any purchase here.
update memberships m
   set source = 'momo'
  from profiles p
 where p.id = m.user_id
   and p.momo_id is not null
   and m.stripe_subscription_id is null
   and m.created_at < '2026-09-13';

create index if not exists memberships_source_idx on memberships(source) where source = 'momo';
