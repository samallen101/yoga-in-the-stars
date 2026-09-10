# How it fits together

**Next.js (App Router)** renders the pages and runs the server actions. Nothing business-critical happens in the browser.

**Supabase Postgres** holds everything. Row Level Security lets people read their own bookings, memberships and orders, and lets teachers and admins read across people. All writes that enforce rules go through the service-role client in server code (`src/lib/booking.ts`, `src/lib/checkout.ts`, the Stripe webhook), so there is exactly one place each rule lives.

**Supabase Auth** handles sign-in (password or magic link). A trigger creates a `profiles` row for every new user. `profiles.role` is `yogi`, `teacher` or `admin`.

**Stripe** takes the money. Memberships are subscriptions; class passes, drop-ins, pay-what-you-wish and event tickets are one-off Checkout sessions. The webhook at `/api/webhooks/stripe` is the source of truth for anything paid: it marks orders paid, activates memberships, creates class passes, confirms paid bookings, and records renewals, failures and refunds.

**The outbox** (`outbox_events`) is the nervous system. Every meaningful thing that happens writes one row. A cron every minute (a) sends the app's own transactional emails for new events and (b) forwards every event to n8n. n8n owns WhatsApp and team notifications, so the club can change the wording and timing of messages without touching this codebase.

**Engagement** is a view, not a job: `engagement` computes each yogi's flag (`new`, `green`, `orange`, `red`, `inactive`) live from their bookings and the thresholds in `settings`. The daily cron only emits an event when a flag changes, so n8n can act once.

## Booking rules (src/lib/booking.ts)

- A session has a `pricing` mode: `members_included`, `drop_in`, `pay_what_you_wish`, `free`.
- `getEntitlement` decides, for one person and one session: active membership (within its per-period limit) → included; else a class pass with credits → uses one credit; else drop-in at the session price. PWYW and free sessions are open to everyone.
- Full sessions take waitlist entries. Cancelling a booked place promotes the earliest waitlisted person (and takes a credit from them if that is how they were going to pay).
- Cancelling within `settings.cancel_cutoff_hours` keeps the class pass credit. Staff cancellations always return it.
- Cancelling a whole session cancels every booking, returns credits, and emits one `session.cancelled` event carrying every affected user id.

## Member pricing on events

`event_tickets.member_price_pence` and `members_only` are enforced in `checkoutForEventTicket` using `is_active_member()` on the server. Non-members cannot buy a member ticket, whatever the browser sends.

## Multi-site

`locations` exists from day one. Sessions and events reference a location. Adding a second building is a row, not a rebuild.

## Files

- `supabase/migrations/0001_init.sql` — schema, RLS, views, helper functions
- `supabase/seed.sql` — starter plans, passes, class types, two weeks of sessions
- `scripts/gen-types.py` — regenerates `src/lib/database.types.ts`
- `src/lib/booking.ts` — entitlement, booking, waitlist, cancellation
- `src/lib/checkout.ts` — Stripe Checkout sessions and customer portal
- `src/lib/outbox.ts` — event emission and delivery to n8n
- `src/lib/notifications.ts` — transactional emails from events
- `src/app/api/webhooks/stripe` — Stripe → database
- `src/app/api/cron/*` — outbox flush (every minute), daily jobs (reminders, flags, expiries)
- `src/app/admin/*` — dashboard, people, schedule, plans, events, broadcast, settings
- `src/app/teach/*` — teacher register, check-in, walk-ins, cancel class
