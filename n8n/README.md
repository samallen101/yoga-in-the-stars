# n8n workflows

Two workflows, importable into n8n (Workflows → Import from file). Regenerate them with `python3 n8n/build.py` after editing `build.py`.

## 1. `outbox-tick.json` — every minute

Calls `GET /api/cron/outbox` on the site so that new events are emailed and forwarded here within a minute. Needed because Vercel's free plan only runs crons daily.

After import, open **Flush outbox** and replace `REPLACE_WITH_CRON_SECRET` with the `CRON_SECRET` from Vercel (`vercel env pull` in the project folder shows it). Activate the workflow.

## 2. `events-to-whatsapp.json` — the automations

The site POSTs every business event to this workflow's webhook. The workflow checks the shared secret, decides who should get a WhatsApp for that event, and sends it through Meta's WhatsApp Cloud API.

After import:

1. Open **Secret matches?** and replace `REPLACE_WITH_OUTBOX_SECRET` with the `OUTBOX_SECRET` from Vercel.
2. Open **Send WhatsApp template** and replace `REPLACE_WITH_PHONE_NUMBER_ID` and `REPLACE_WITH_WHATSAPP_ACCESS_TOKEN` with the values from Meta (below).
3. Activate the workflow and copy its production webhook URL (looks like `https://n8n.<host>/webhook/stars`). Put it in Vercel as `N8N_WEBHOOK_URL` and redeploy.

### What it sends

| Event | Who gets a WhatsApp | Template |
|---|---|---|
| `user.registered` | team | `yits_team_alert` |
| `membership.purchased`, `membership.granted` | team, and the new member (welcome + community link) | `yits_team_alert`, `yits_welcome` |
| `membership.payment_failed` | team | `yits_team_alert` |
| `membership.cancelled` | team | `yits_team_alert` |
| `booking.reminder` (daily, for tomorrow's classes) | the person booked | `yits_reminder` |
| `booking.promoted` (a waitlist space opened) | the person | `yits_promoted` |
| `session.cancelled` | everyone booked, and the team | `yits_cancelled`, `yits_team_alert` |
| `engagement.flag_changed` to orange | the member (gentle check-in) | `yits_checkin` |
| `engagement.flag_changed` to red | team | `yits_team_alert` |
| `broadcast.whatsapp` (Admin → Broadcast) | each recipient | `yits_broadcast` |
| `class_pass.expiring` | the pass holder | `yits_pass_expiring` |

Members only get messages if they ticked WhatsApp opt-in and gave a mobile number. Team numbers come from Admin → Settings. Everything else (booking confirmations, receipts, cancellations of your own booking) goes by email from the site.

Who-gets-what and the placeholder values live in the **Build messages** node. The wording lives in the templates in WhatsApp Manager.

### Meta setup (one-off, ~1 hour plus verification wait)

1. In Meta Business Suite for the club's Facebook page, complete **business verification** (Settings → Security Centre). This can take days; start it first.
2. Create a WhatsApp Business app at developers.facebook.com → My Apps → Create App → Business → add the WhatsApp product. Add the club's dedicated number (it must not be on any personal WhatsApp).
3. Note the **Phone number ID** (WhatsApp → API Setup) and create a permanent **System User access token** with `whatsapp_business_messaging` and `whatsapp_business_management` permissions (Business Settings → Users → System users → Add → Generate token).
4. Create the templates below in WhatsApp Manager → Message templates, language English (UK), and wait for approval (usually minutes to hours).

### Templates to create

Category **Utility** unless noted. `{{1}}`, `{{2}}` are the placeholders the workflow fills, in order.

- `yits_team_alert` · `Club alert: {{1}}`
- `yits_welcome` · `Hi {{1}}, welcome to Yoga in the Stars. Your {{2}} is active and every regular session is now included. Join the members' WhatsApp community here: {{3}}. Reply here any time.`
- `yits_reminder` · `Hi {{1}}, a reminder that you're booked on {{2}} tomorrow at {{3}}. Can't make it? Cancel in My club so someone on the waitlist can come.`
- `yits_promoted` · `Hi {{1}}, a space opened up: you're now booked on {{2}} on {{3}}. If you can't make it any more, please cancel in My club.`
- `yits_cancelled` · `Hi {{1}}, sorry, {{2}} on {{3}} has been cancelled. {{4}} Any class pass credit is back on your pass; if you paid for a drop-in we'll sort a refund.`
- `yits_checkin` · `Hi {{1}}, we haven't seen you at the club for a couple of weeks. Everything ok? Reply here if you'd like a hand getting back into it, or just come along, there's always a mat for you.`
- `yits_pass_expiring` · `Hi {{1}}, you still have {{2}} classes on your pass and it expires on {{3}}. Book them in from the schedule.`
- `yits_broadcast` (category **Marketing**) · `{{1}}`

Why templates: WhatsApp only allows a business to start a conversation with an approved template. Once someone replies, you can chat freely for 24 hours. Meta charges per conversation started (utility is cheaper than marketing); at club scale this is a few pounds a month.

### Testing without Meta

Before the number is verified, point the site at this workflow anyway and put a **Set** node in place of **Send WhatsApp template** to see what would be sent. Every event is also visible in Admin → Dashboard (What's been happening).
