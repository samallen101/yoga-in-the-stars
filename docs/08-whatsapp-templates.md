# WhatsApp message templates

These are the messages the club's WhatsApp number can start a conversation with. WhatsApp only lets a business message someone first using a template that Meta has approved; once the person replies, the team can chat freely for 24 hours. Members only receive these if they ticked WhatsApp opt-in on the site and gave a mobile number.

Two ways to get them approved once the number is linked: run `python3 n8n/submit-templates.py <WABA_ID>` with a System User token (submits all nine in one go, `--status` shows approvals), or paste each one by hand in WhatsApp Manager, Message templates, Create template. Language is English (UK) for all of them. Approval usually takes minutes to a few hours; Marketing ones can take longer.

Rules Meta enforces, already respected below: a body cannot begin or end with a variable, every variable needs an example, variables are numbered in order, and re-engagement or promotional messages must be Marketing (Utility ones get rejected or recategorised). The Marketing ones carry an opt-out line.

Placeholders like {{1}} are filled in by the n8n workflow (Build messages node). The wording lives here and in Meta, not in the site.

## yits_team_alert

Category: Utility. Language: English (UK).

Body:

> Club alert: {{1}}. Open the admin dashboard for details.

Example values: {{1}} = New member: Priya (Standard)

## yits_welcome

Category: Utility. Language: English (UK).

Body:

> Hi {{1}}, welcome to Yoga in the Stars. Your {{2}} is active and every regular session is now included. Join the members' WhatsApp community here: {{3}}. Reply here any time.

Example values: {{1}} = Priya, {{2}} = Standard membership, {{3}} = https://chat.whatsapp.com/example

## yits_reminder

Category: Utility. Language: English (UK).

Body:

> Hi {{1}}, a reminder that you're booked on {{2}} tomorrow at {{3}}. Can't make it? Cancel in My club so someone on the waitlist can come.

Example values: {{1}} = Priya, {{2}} = Vinyasa Flow, {{3}} = 7:00pm
Button: website link, text "My club", URL https://yoga-in-the-stars.vercel.app/me

## yits_promoted

Category: Utility. Language: English (UK).

Body:

> Hi {{1}}, a space opened up: you're now booked on {{2}} on {{3}}. If you can't make it any more, please cancel in My club.

Example values: {{1}} = Priya, {{2}} = Vinyasa Flow, {{3}} = Tue 23 Sep, 7:00pm
Button: website link, text "My club", URL https://yoga-in-the-stars.vercel.app/me

## yits_cancelled

Category: Utility. Language: English (UK).

Body:

> Hi {{1}}, sorry, {{2}} on {{3}} has been cancelled. {{4}} Any class pass credit is back on your pass; if you paid for a drop-in we'll sort a refund. See the schedule for other classes this week.

Example values: {{1}} = Priya, {{2}} = Vinyasa Flow, {{3}} = Tue 23 Sep, 7:00pm, {{4}} = The pub needs the room for a private event.
Button: website link, text "Schedule", URL https://yoga-in-the-stars.vercel.app/schedule

## yits_checkin

Category: Marketing. Language: English (UK).

Body:

> Hi {{1}}, we haven't seen you at the club for a couple of weeks. Everything ok? Reply here if you'd like a hand getting back into it, or just come along, there's always a mat for you. Reply STOP if you'd rather not get these.

Example values: {{1}} = Priya

## yits_pass_expiring

Category: Utility. Language: English (UK).

Body:

> Hi {{1}}, you still have {{2}} classes on your pass and it expires on {{3}}. Book them in from the schedule.

Example values: {{1}} = Priya, {{2}} = 2, {{3}} = Sun 5 Oct
Button: website link, text "Schedule", URL https://yoga-in-the-stars.vercel.app/schedule

## yits_membership_move

Category: Utility. Language: English (UK).

Body:

> Hi {{1}}, bookings have a new home and your {{2}} came with us. You're paid up until {{3}}; after that the old system won't renew it. To carry on without a gap, set up your card on the new site. Nothing is charged before {{4}}. Reply here with any questions.

Example values: {{1}} = Priya, {{2}} = Standard membership, {{3}} = 12 October, {{4}} = 12 October
Button: website link, text "Set up my card", URL https://yoga-in-the-stars.vercel.app/me

## yits_broadcast

Category: Marketing. Language: English (UK).

Body:

> Hi {{1}}, a note from Yoga in the Stars: {{2}} Reply STOP if you'd rather not get these.

Example values: {{1}} = Priya, {{2}} = Full Moon Ritual this Friday at 7:30pm, members £12. Book from the schedule.

## Sent by email instead

Booking confirmations, your own cancellations, receipts, the welcome for new registrations, membership moved confirmation and payment failed notices go by email from the site. WhatsApp is kept for the moments a nudge on the phone helps: tomorrow's reminder, a waitlist space, a cancelled class, a pass about to expire, a membership about to lapse, the check-in, and broadcasts.
