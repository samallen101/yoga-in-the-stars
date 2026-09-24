# Yoga in the Stars: where we are heading

Source of truth for the project. Updated 24 Sep 2026. Owner: Sam.
If any other document disagrees with this one, this one wins. Older plans (02, 03) are kept for history only.

## The direction in one paragraph

We are replacing Momo with the club's own booking, membership and member-contact system, built by Sam and already running at https://yoga-in-the-stars.vercel.app. It does everything Momo did (schedule, bookings, waitlists, memberships, class passes, pay what you wish, events, teacher tools, refunds) plus the things Momo never could: knowing who every member is, member-only prices, messages to exactly the right people, and early warning when someone drifts. WhatsApp is the main way the club talks to people, with email alongside. We switch over carefully, in stages, with no confusion for members.

## Why we changed course (10 Sep 2026)

The first plan was to keep Momo and put GoHighLevel and n8n around it. We dropped it because Momo has no API, so every link to it would have been a workaround (parsing emails, scraping exports), and the things the club wants most (member-only prices, messaging by booking, knowing who is a member) still would not have worked. GoHighLevel would have cost around £90 to £120 a month and still could not take bookings. Building the club's own system gives one place for everything, costs little to run, and is under our control.

## How it fits together

- **The site** (Next.js on Vercel): public pages, schedule, booking, shop, events, member area (/me), teacher area (/teach), admin (/admin). Will move to yogainthestars.com on switch-over day.
- **The database** (Supabase, London): people, memberships, passes, bookings, orders, events, plus the full Momo history. Nightly backup to Sam's VPS, 30 days kept.
- **Payments** (the club's own Stripe account): subscriptions, passes, drop-ins, pay what you wish, event tickets, refunds, customer portal for card changes. Still in test mode.
- **Email** (Resend, sending as hello@yogainthestars.com): confirmations, reminders, time changes, broadcasts. Replies go to the hello@ mailbox in Zoho.
- **WhatsApp** (Meta Cloud API through n8n on Sam's VPS): automated messages from a second, dedicated club number. The club's existing number and its WhatsApp Business app, used daily for the community, stay untouched.
- **n8n** (Sam's Hostinger VPS): receives every business event from the site and turns it into WhatsApp messages and team alerts. Also runs the uptime monitor.
- **Safety net**: health page, Sentry error reports, uptime emails to Sam, admin fix-it tools, and the launch gate (below).

## What gets retired

Momo (after switch-over), Groove (website and DNS move off it), SendGrid and Mailchimp (replaced by Resend and the site's broadcasts), Calendly (replaced by WhatsApp conversations). GoHighLevel and ManyChat were never adopted; ManyChat may come back later for Instagram replies if needed.

## Rules we work by

1. **No member hears anything before go-live.** The launch gate in Admin, Settings holds every email and WhatsApp to members until a go-live date is set. Before then only the team's test addresses get messages. Added after five members received move-over emails early on 21 and 22 Sep.
2. **Nothing goes live until the launch test script is fully green**, worked through by a human with Tarin and Basia.
3. **Members move over at their own renewal date**, with a personal note from Tarin first, so nobody pays twice and nobody loses a class.
4. **Automation opens the conversation, people finish it.** Automated messages are short, signed by a person, and hand over to Tarin or Basia fast. Never sound like a bot.
5. **Look first, delete nothing** in the club's Meta, WhatsApp or other accounts without Sam's say-so for that item.
6. **Plain English and no em dashes** in anything shared with the club.

## What the club asked for, and where it stands

| What Tarin and Basia asked for | Status |
|---|---|
| Know when someone buys a membership | Built. Team alert goes by WhatsApp once the number is live. |
| Dashboard: members, attendance, engagement | Live in Admin (dashboard, People, Insights). |
| Member-only event prices | Built. |
| One system for classes, passes, memberships, events | Built, including pausing memberships and changing classes. Supports more than one venue. |
| Members' community without facilitating it | Community link set in Admin, Settings; sent automatically once messages are live. |
| Message everyone booked on a class | Built: cancel, move time (with reason), broadcast to one class. |
| Orange/red early warning on drop-off | Flags built. Automatic check-in messages come with WhatsApp. |
| A fast, human funnel from ads | Not started. Needs the WhatsApp number and the marketing person. |
| Back end ready for continuous local ads | Registration and contact records ready. Landing pages per ad theme not built. |
| New website | Redesign live. Needs real photos, the Breathwork London page, and the domain move. |
| Stay on Momo or leave | Decided: leave, carefully. |

## Path to switch-over

1. **Unblock (Tarin):** hello@ mailbox in Zoho; second More Minutes number and Meta's call code; confirm prices (Standard £75 or £79, HALFPRICEYOGA, founders at £33, free plans); register on the site to be made admin; change the passwords that were sent over WhatsApp.
2. **Connect (Sam):** new Resend key once hello@ exists; register the second number in the Cloud API, System User token, submit the nine templates, update the n8n workflow.
3. **Team play-test (Sam, Tarin, Basia, a couple of teachers):** Tarin enters the real timetable and one test event; the team works through test script sections 1 to 7 on a video call, test cards only.
4. **Live pilot:** one event sold only on the new site with live Stripe keys and 10 to 15 friendly members. Events don't share spaces with Momo classes, so there is no double-booking risk. Needs Sam's explicit go-ahead before live keys go in.
5. **Switch-over day (test script section 10):** move yogainthestars.com from Groove to Vercel; final Momo export and import; stop new bookings in Momo and cancel every Momo renewal; Tarin's personal note to members; set the go-live date; members add their card at their renewal date.

## After launch

WhatsApp front-desk agent (n8n, drafts first), the ad funnel with the marketing person (post or ad, instant reply, WhatsApp, human, booked), automatic orange/red check-ins, landing pages per ad theme, review asks after a third class, and a monthly members' perk.

## Biggest risks

- **Card re-entry at renewal** is where members could drift. Mitigation: personal note from Tarin, reminders timed to each renewal, admin can extend a membership by hand.
- **Paying twice** if a Momo renewal is not cancelled. Mitigation: switch-over checklist, move-over message only fires after go-live.
- **The domain move**, since DNS lives inside Groove. Mitigation: full record inventory in 04, email records (Zoho, Resend) copied first.
- **Vercel's free Hobby plan is for non-commercial use.** A club taking payments should move to Vercel Pro (about $20 a month) before launch. To confirm.

## Documents in this project

- 00 Direction (this file): where we are heading.
- 01 Discovery notes: what we learned on 10 Sep. History.
- 02 Plan of attack, 03 Plan for Tarin and Basia: the first plan (Momo plus GoHighLevel). Superseded.
- 04 Build status: what is built and live, accounts, how things run. Living document.
- 05 Website redesign: design decisions for the site.
- 06 Momo data: what came over from Momo and how.
- 07 Launch test script: the checklist that has to be green before launch.
- 08 WhatsApp templates: the nine message templates for Meta.
- 09 Decision log: dated decisions and incidents.
