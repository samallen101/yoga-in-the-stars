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
| `membership.transfer_needed` (imported Momo membership ending in 14 days) | the member | `yits_membership_move` |

Members only get messages if they ticked WhatsApp opt-in and gave a mobile number. Team numbers come from Admin → Settings. Everything else (booking confirmations, receipts, cancellations of your own booking) goes by email from the site.

Who-gets-what and the placeholder values live in the **Build messages** node. The wording lives in the templates in WhatsApp Manager.

### Meta setup (one-off, ~1 hour plus verification wait)

1. In Meta Business Suite for the club's Facebook page, complete **business verification** (Settings → Security Centre). This can take days; start it first.
2. Create a WhatsApp Business app at developers.facebook.com → My Apps → Create App → Business → add the WhatsApp product. Add the club's dedicated number (it must not be on any personal WhatsApp).
3. Note the **Phone number ID** (WhatsApp → API Setup) and create a permanent **System User access token** with `whatsapp_business_messaging` and `whatsapp_business_management` permissions (Business Settings → Users → System users → Add → Generate token).
4. Create the templates below in WhatsApp Manager → Message templates, language English (UK), and wait for approval (usually minutes to hours).

### Templates to create

The exact wording, categories, examples and buttons are in `n8n/whatsapp-templates.json` (Meta API shape) and, for pasting by hand, `docs/08-whatsapp-templates.md`. Nine templates: `yits_team_alert`, `yits_welcome`, `yits_reminder`, `yits_promoted`, `yits_cancelled`, `yits_checkin`, `yits_pass_expiring`, `yits_membership_move`, `yits_broadcast`. Once the WABA works they can be submitted in one go: `python3 n8n/submit-templates.py <WABA_ID>` with `META_TOKEN` in the environment.

Why templates: WhatsApp only allows a business to start a conversation with an approved template. Once someone replies, you can chat freely for 24 hours. Meta charges per conversation started (utility is cheaper than marketing); at club scale this is a few pounds a month.

### Testing without Meta

Before the number is verified, point the site at this workflow anyway and put a **Set** node in place of **Send WhatsApp template** to see what would be sent. Every event is also visible in Admin → Dashboard (What's been happening).

## 3. `uptime-monitor.json` — every 5 minutes

Calls `GET /api/health` on the site. When the result changes from fine to a problem it emails Sam once with which check failed; when it recovers it emails once more. Uses the "Gmail account" credential already in n8n. Admin → Health on the site shows the same checks live.
