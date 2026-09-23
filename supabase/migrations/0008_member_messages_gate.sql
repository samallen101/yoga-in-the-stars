-- Launch gate for member messages (22 Sep 2026).
-- Until member_messages_live_from is set and reached, the site only emails
-- addresses on the test allowlist; everything else is dropped and logged as held
-- (never queued, so switching on can't release a backlog). The same flag is sent
-- to n8n so WhatsApp follows the same rule.
alter table settings
  add column if not exists member_messages_live_from timestamptz,
  add column if not exists message_test_allowlist text[] not null default '{sam.allen101@gmail.com,tarin@yogainthestars.com}';

-- Record of every email the gate held back, for Admin → Health.
alter table outbox_events
  add column if not exists email_held boolean not null default false;

-- Momo members nudged too early (21-22 Sep) get a fresh, correct nudge after launch.
update memberships set transfer_nudged_at = null where source = 'momo' and transfer_nudged_at is not null;
