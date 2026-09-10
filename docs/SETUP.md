# Setup

Getting the app running takes about 30 minutes the first time. Four accounts: GitHub (done), Supabase, Stripe, Vercel. Resend for email and n8n for WhatsApp can come later; the app works without them (emails are logged, outbox events queue up).

## 1. Supabase (database + logins)

1. Create a project at supabase.com (region: London / eu-west-2). Save the database password.
2. SQL Editor → paste the whole of `supabase/migrations/0001_init.sql` → Run.
3. SQL Editor → paste `supabase/seed.sql` → Run. (Edit the names and prices first if you like; everything is editable later in Admin.)
4. Project Settings → API: copy the Project URL, the `anon` key and the `service_role` key into `.env.local` / Vercel.
5. Authentication → URL configuration: set Site URL to your domain and add `https://<your-domain>/auth/callback` (and `http://localhost:3000/auth/callback` for dev) to the redirect list.
6. Authentication → Providers → Email: leave "Confirm email" on for production. For quick local testing you can turn it off.
7. Register through the site, then in SQL Editor run:
   `update profiles set role = 'admin' where email = 'you@example.com';`

## 2. Stripe (payments)

Use the club's own Stripe account, in the club's name, so payouts go to the club's bank. Add teammates under Settings → Team.

1. Developers → API keys: copy the secret and publishable keys (test keys first).
2. Developers → Webhooks → Add endpoint: `https://<your-domain>/api/webhooks/stripe`. Events to send:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`.
   Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Settings → Billing → Customer portal: turn on, allow customers to update payment method, pause (optional) and cancel subscriptions. This is the "Manage membership" button.
4. Local dev: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` gives you a local signing secret.

Membership plans create their own Stripe product and price the first time someone buys, so there is nothing to set up in Stripe for products.

## 3. Vercel (hosting)

1. Import the GitHub repo. Framework: Next.js. Root: `/`.
2. Add every variable from `.env.example` under Environment Variables.
3. `CRON_SECRET`: any long random string. Vercel sends it automatically to the two cron routes in `vercel.json` (outbox every minute, daily jobs at 07:00 UTC).
4. Add the custom domain, then update `NEXT_PUBLIC_SITE_URL`, the Supabase redirect URLs and the Stripe webhook URL to match.

## 4. Resend (transactional email)

1. Create an account, add and verify the club's sending domain.
2. Put the API key in `RESEND_API_KEY` and set `EMAIL_FROM` to something like `Yoga in the Stars <hello@yourdomain>`.
Until this is set, emails are printed to the server log instead of sent.

## 5. n8n (WhatsApp and team pings)

Every business event lands in `outbox_events` and is POSTed to `N8N_WEBHOOK_URL` with header `X-Stars-Secret: <OUTBOX_SECRET>` as:

```json
{
  "id": "…", "type": "membership.purchased", "created_at": "…",
  "user": { "id": "…", "email": "…", "full_name": "…", "phone": "…", "whatsapp_opt_in": true },
  "payload": { "plan": "Club Membership", "membership_id": "…", "period_end": "…" }
}
```

Event types: `user.registered`, `membership.purchased`, `membership.renewed`, `membership.paused`, `membership.resumed`, `membership.cancelled`, `membership.cancel_scheduled`, `membership.payment_failed`, `membership.granted`, `class_pass.purchased`, `class_pass.granted`, `class_pass.expiring`, `booking.created`, `booking.waitlisted`, `booking.promoted`, `booking.cancelled`, `booking.reminder`, `session.cancelled` (payload has `affected_user_ids`), `event_ticket.purchased`, `engagement.flag_changed` (`from`/`to`), `broadcast.whatsapp` (one per recipient, payload has `phone` and `message`), `broadcast.sent`, `order.refunded`.

Suggested n8n flows to start with: `membership.purchased` → WhatsApp the team numbers from Settings and send the member a welcome from the club number; `engagement.flag_changed` to orange → gentle personal WhatsApp; to red → ping the team; `session.cancelled` → WhatsApp everyone in `affected_user_ids` who opted in; `broadcast.whatsapp` → send `message` to `phone`.

## Local development

```
pnpm install
cp .env.example .env.local   # fill in Supabase + Stripe test keys
pnpm dev
```

Regenerate database types after changing the schema (needs a Postgres with the migration applied; the Supabase CLI route needs Docker):

```
python3 scripts/gen-types.py "postgresql://postgres:<password>@db.<project>.supabase.co:5432/postgres"
```
