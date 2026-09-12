# Launch test script

The rule Sam set: when we switch from Momo there can be no problems. This is the checklist that earns that. Every line is done by a human, on the live site (https://yoga-in-the-stars.vercel.app), with Stripe still in test mode, before anyone real is pointed at it. Tick each box, note anything odd, and nothing goes live until the whole list is green.

How to run it: work through the sections in order, in one sitting if possible, with two browsers open (one as a yogi, one as admin at /admin). Test cards: 4242 4242 4242 4242 pays, 4000 0000 0000 0002 is declined, 4000 0000 0000 0341 attaches but fails at the next renewal. Any expiry in the future, any CVC.

## 0. Before you start

- [ ] /api/health returns 200 (warnings about test-mode Stripe and no email provider are expected until launch).
- [ ] Admin, Health page shows the last outbox events flowing to n8n with no lag.
- [ ] n8n: the three YITS workflows are active (tick, events, uptime monitor).
- [ ] Last nightly database backup on the VPS is from today (ls /root/backups/db).

## 1. Sign up and sign in

- [ ] Register a brand new yogi on a phone (real phone, mobile data, not wifi). Magic link or password flow completes and lands on the schedule.
- [ ] Register with an email that already exists: gets a clear "sign in instead" message, no duplicate profile.
- [ ] An imported Momo member signs in for the first time using the email Momo had for them. Their name, phone, active membership or remaining pass credits are already there on /me.
- [ ] An imported member whose Momo email was wrong or old: admin can find them in People and change the email.
- [ ] Sign out, sign in again, session survives closing the browser.

## 2. Paying, all four kinds

- [ ] Drop-in: book a class with the drop-in price, pay with 4242. Booking appears on /me, order shows paid in admin, Stripe dashboard shows the payment with the order id in metadata.
- [ ] Pay what you wish: same flow with a custom amount. Confirm the amount charged equals what was typed.
- [ ] Class pass: buy the 3 Class Pass. /me shows 3 credits with the right expiry date. Book a class: credits drop to 2.
- [ ] Membership: buy Standard. /me shows the membership, next renewal date matches Stripe. Book a class: no credit deducted, no charge.
- [ ] Event ticket: buy a ticket to a test event. Ticket appears on /me and the event's attendee list in admin.
- [ ] Declined card (0002): the site says the payment failed, no order is marked paid, no booking or pass is created, and the user can try again.
- [ ] Abandon checkout (close the Stripe page): nothing is created, the pending order does not block a retry.

## 3. Refunds, cancellations and failed renewals

- [ ] Refund a drop-in from the Stripe dashboard: within a minute the order shows refunded in admin and the booking is cancelled.
- [ ] Refund a class pass purchase: order refunded and the pass is voided or credits removed (check /me).
- [ ] Member opens the billing portal from /membership and cancels at period end: site still shows active until the end date, then Stripe's subscription.deleted turns it off (fake this by cancelling immediately in the Stripe dashboard and checking /me).
- [ ] Failed renewal: create a membership with card 0341, then in Stripe advance the test clock or use "simulate failed payment". The membership goes to past_due on the site, the member sees a "update your card" notice, and an outbox event fires so staff know.
- [ ] Member updates the card in the portal and the next invoice succeeds: membership returns to active.

## 4. Booking rules

- [ ] Full class: set a test class to capacity 2, book it with two accounts, a third account is offered the waitlist and accepts.
- [ ] Waitlist promotion: one of the two booked people cancels. The waitlisted person is promoted automatically, their credit is taken, and a booking.promoted event goes out (they should get the message).
- [ ] Waitlisted person with no credit left: cancelling a booked spot leaves them on the waitlist rather than booking them for free.
- [ ] Booking cutoff: try to book a class that starts inside the cutoff minutes set in Admin, Settings. It refuses with a clear message.
- [ ] Cancel cutoff: cancel a booking more than the cutoff hours before the class, the credit comes back. Cancel inside the cutoff, the credit is kept (late cancel) and the message says so.
- [ ] Double booking: booking the same class twice from the same account is refused.
- [ ] Two people, last spot, same second: two browsers press Book at once on a class with one space. Exactly one gets the spot and the other is waitlisted. Never two bookings.
- [ ] Expired pass: set a pass expiry to yesterday using the admin fix-it tools. Booking with it is refused and the site offers to buy or pay drop-in.

## 5. Teacher tools

- [ ] Teacher signs in and sees only their own classes on /teach.
- [ ] Teacher marks attendance (attended, no show) and it appears on the person's page in admin and feeds the engagement colour.
- [ ] Teacher cancels a class: every booked person gets their credit back, everyone booked and waitlisted gets the cancellation message, the class shows as cancelled on the schedule.
- [ ] The pub takes the room: admin cancels or moves the class (edit the time). Bookings follow the new time and the people booked are notified.
- [ ] Substitute teacher: admin changes the teacher on a session. Reminder emails name the new teacher.

## 6. Admin fix-it tools (People, open any person)

- [ ] Add 1 credit to a pass, remove 1 credit, move an expiry date. Each shows a confirmation and the change is visible on the person's /me.
- [ ] Extend a membership by 7 days. End a membership now.
- [ ] Cancel a booking on someone's behalf: credit always comes back, even inside the cancel cutoff.
- [ ] Comp someone onto a class: booking appears with no credit taken and no charge.
- [ ] Record a cash payment: order appears with method cash and shows in the person's history.
- [ ] Grant a pass and a membership by hand (existing tools) still work.
- [ ] Notes save; role change to teacher works; admin cannot remove their own admin role.
- [ ] History from Momo shows the person's old orders at the bottom of the page.

## 7. Messages and reminders

- [ ] Booking confirmation arrives (email once Resend is on, WhatsApp once Meta is on; until then confirm the event reaches n8n).
- [ ] Reminder for tomorrow's class goes out when the daily cron runs (trigger it by hand: GET /api/cron/daily with the cron secret header) and is not sent twice if the cron runs twice.
- [ ] Class pass expiring soon message fires for a pass expiring inside the window.
- [ ] Engagement flag change (green to amber) fires for someone who has not attended within the threshold.
- [ ] Broadcast from Admin, Broadcast reaches the chosen segment only.

## 8. Public site on a phone

- [ ] Home, schedule, classes, events, membership, contact and privacy pages load on a phone and nothing is cut off.
- [ ] Schedule shows the next two weeks with the right times in London time (check a class during BST and one after the clocks change).
- [ ] Every "Book" button on the schedule leads somewhere sensible when logged out (sign in, then back to the class).
- [ ] The Momo booking links on the old website and Instagram are replaced or redirected.

## 9. Safety net

- [ ] Break something on purpose: pause the n8n container. Within 10 minutes Sam gets the uptime email, /api/health shows the automations warning, Admin, Health shows it red. Unpause; a recovery email arrives.
- [ ] Restore drill: take the latest backup dump and restore it into the local test database to prove the backups are usable.
- [ ] Stripe webhook secret wrong on purpose (edit env, redeploy): health shows payments red, and a test purchase is still recorded as pending, never lost. Put it back.
- [ ] A member writes in saying "my credits are wrong": the person page has enough history (Momo orders, site orders, bookings) to answer without opening the database.

## 10. Switch-over day

- [ ] Stripe live keys in Vercel, webhook endpoint recreated for live mode, health shows payments live.
- [ ] Resend domain verified, sender address set, one real email sent to Sam.
- [ ] Prices confirmed with Tarin (Standard £79 or £75, HALFPRICEYOGA).
- [ ] Momo re-exported one last time and imported again (the script skips people and orders it already has) so nothing bought in the gap is lost.
- [ ] Momo set to stop taking new bookings; members told the new address and that their credits and memberships have moved.
- [ ] Imported members with a Momo membership are asked to set up their card on the new site (there is no Stripe subscription behind them yet); admin extends their membership by hand if they need time.
- [ ] Sam, Tarin and Basia each book and cancel one class on the live site as a final check.
