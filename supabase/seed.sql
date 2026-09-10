-- Starter data for Yoga in the Stars. Safe to run once on a fresh project.
-- Edit names/prices to match the club before running, or change them later in Admin.

insert into locations (name, address) values
  ('The Room Above the Pub', 'London');

insert into membership_plans (name, description, price_pence, interval, classes_per_period, event_discount_percent, sort_order) values
  ('Club Membership', 'Every regular class included, member prices on events, and you keep the space alive.', 6500, 'month', null, 30, 1),
  ('Supporter Membership', 'Everything in Club, plus a bit extra towards the community pot. For people who want to give more.', 8500, 'month', null, 50, 2);

insert into class_pass_products (name, description, credits, price_pence, validity_days, sort_order) values
  ('5 Class Pass', 'Five classes to use whenever you like.', 5, 5500, 90, 1),
  ('10 Class Pass', 'Ten classes, four months to use them.', 10, 10000, 120, 2);

insert into class_types (name, description, duration_minutes, colour, default_capacity, default_pricing, default_drop_in_pence) values
  ('Slow Flow', 'A steady, mindful vinyasa. All levels.', 60, '#3b2f6b', 16, 'members_included', 1200),
  ('Morning Flow', 'Wake the body up before work.', 60, '#c9a24a', 16, 'members_included', 1200),
  ('Restorative', 'Long holds, props, and a proper rest.', 75, '#2f7d5b', 14, 'members_included', 1200),
  ('Community Yoga', 'Pay what you wish. Everyone welcome, no experience needed.', 60, '#c2701c', 20, 'pay_what_you_wish', 0),
  ('Breathwork', 'Guided breathwork journey. Drop-in or member price.', 90, '#b5432f', 20, 'members_included', 1500);

-- Two weeks of sessions from next Monday. Times are Europe/London.
with base as (
  select date_trunc('week', now() at time zone 'Europe/London')::date + 7 as monday
), plan as (
  select * from (values
    ('Morning Flow', 0, '07:30', 'Mon'),
    ('Slow Flow',    0, '18:30', 'Mon'),
    ('Community Yoga', 1, '19:00', 'Tue'),
    ('Slow Flow',    2, '18:30', 'Wed'),
    ('Morning Flow', 3, '07:30', 'Thu'),
    ('Breathwork',   3, '19:30', 'Thu'),
    ('Restorative',  6, '10:00', 'Sun')
  ) as t(class_name, dow, start_time, label)
)
insert into class_sessions (class_type_id, location_id, starts_at, ends_at, capacity, pricing, drop_in_pence)
select ct.id,
       (select id from locations limit 1),
       ((b.monday + p.dow + w.week * 7)::text || ' ' || p.start_time)::timestamp at time zone 'Europe/London',
       ((b.monday + p.dow + w.week * 7)::text || ' ' || p.start_time)::timestamp at time zone 'Europe/London' + (ct.duration_minutes || ' minutes')::interval,
       ct.default_capacity, ct.default_pricing, ct.default_drop_in_pence
from base b
cross join plan p
cross join (select 0 as week union all select 1) w
join class_types ct on ct.name = p.class_name;

update settings set
  club_name = 'Yoga in the Stars',
  cancel_cutoff_hours = 2,
  orange_after_days = 10,
  red_after_days = 21
where id = 1;

-- After you have registered through the site, make yourself admin:
-- update profiles set role = 'admin' where email = 'you@example.com';
