import Link from "next/link";
import { listUpcomingSessions } from "@/lib/booking";
import { createAdminClient, getCurrentUser } from "@/lib/supabase/server";
import { fmtDate, fmtTime, gbp } from "@/lib/format";
import { waLink } from "@/components/site-footer";
import { pricingLabel } from "@/components/session-card";

const reviews = [
  ["Love, love, love Yoga In The Stars. I can't rave about them enough", "Ana Quina"],
  ["Honestly, amazing", "India Lee Reed"],
  ["Probably the best yoga place in East London", "Gosia Rokicka"],
  ["Transformative - 5 Stars Are Not Enough", "Rittika Dasgupta"],
  ["Fantastic studio", "Forest Flora"],
  ["It is a no brainer to join YITS", "Natalia Gonzalez"],
];

function Star() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.8L12 17.7 6 21l1.3-6.8-5-4.7 6.8-.8z" />
    </svg>
  );
}

function SectionHead({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: { href: string; label: string } }) {
  return (
    <div className="rule pt-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <div className="caps text-accent mb-1">{eyebrow}</div>}
        <h2 className="text-4xl sm:text-5xl leading-none">{title}</h2>
      </div>
      {action && <Link href={action.href} className="text-sm font-semibold underline underline-offset-4">{action.label}</Link>}
    </div>
  );
}

export default async function HomePage() {
  const db = createAdminClient();
  const [me, sessions, { data: settings }, { data: events }, { data: plans }, { data: passes }] = await Promise.all([
    getCurrentUser(),
    listUpcomingSessions(7),
    db.from("settings").select("*").eq("id", 1).single(),
    db.from("events").select("*, event_tickets(price_pence, member_price_pence)").eq("status", "published").gte("starts_at", new Date().toISOString()).order("starts_at").limit(3),
    db.from("membership_plans").select("*").eq("active", true).order("sort_order"),
    db.from("class_pass_products").select("*").eq("active", true).order("sort_order"),
  ]);

  const week = sessions.filter((s) => s.status === "scheduled").slice(0, 6);
  const wa = settings?.contact_whatsapp ? waLink(settings.contact_whatsapp, "Hi Yoga in the Stars, ") : "/contact";
  const address = settings?.address_line ?? "Upstairs The Heathcote and Star, 344 Grove Green Road, E11 4EA";

  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="grid gap-10 lg:grid-cols-12 items-start pt-4">
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="caps text-accent">Join the Yoga in the Stars community</div>
          <h1 className="text-5xl sm:text-7xl leading-[0.98] tracking-tight">A Million Miles away from a yoga studio.</h1>
          <p className="text-lg leading-relaxed max-w-xl text-[#3d3831]">
            Not-for-profit yoga club with more than 20 sessions a week to choose from, curated experiences, happenings and pay as you wish membership, with free upgrades to couples membership.
          </p>
          <p className="text-sm leading-relaxed text-ink-soft">
            Mon–Sat and occasional Sunday offerings.<br />{address}.
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            {me ? (
              <Link href="/schedule" className="btn-primary">See live schedule now</Link>
            ) : (
              <>
                <Link href="/register" className="btn-primary">Register / How to Join</Link>
                <Link href="/schedule" className="btn-secondary">See live schedule now</Link>
              </>
            )}
            <a href={wa} target="_blank" rel="noreferrer" className="btn-ghost text-accent">Message us on WhatsApp</a>
          </div>
        </div>
        <div className="lg:col-span-5 grid grid-cols-2 gap-3">
          {["a session upstairs", "the club, alive", "the Yoga-Social", "a happening"].map((cap, i) => (
            <div key={cap} className={`h-44 sm:h-52 bg-bg-soft border border-line flex items-end p-3 text-xs text-ink-soft ${i % 2 ? "mt-8" : ""}`}>
              {cap}
            </div>
          ))}
        </div>
      </section>

      {/* Members strip */}
      <section className="bg-bg-soft px-5 py-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <p>
          <strong>Already registered?</strong> Sign in to book and cancel sessions, manage your membership, see your passes and join the members’ WhatsApp community. Teachers: your classes and register are in the same place.
        </p>
        <div className="flex gap-4 font-semibold underline underline-offset-4 shrink-0">
          {me ? <Link href="/me">My club</Link> : <Link href="/login">Sign in</Link>}
          <Link href={me ? "/me" : "/login?next=/me"}>Book / Cancel</Link>
        </div>
      </section>

      {/* We are not a yoga studio */}
      <section className="grid gap-8 lg:grid-cols-12">
        <h2 className="lg:col-span-5 rule pt-4 text-5xl sm:text-6xl leading-none">WE ARE NOT A YOGA STUDIO</h2>
        <div className="lg:col-span-7 rule pt-5 space-y-4 text-lg leading-relaxed text-[#3d3831]">
          <p>
            We are more like a members club, or community for seekers and anyone interested in cultivating a healthy relationship with themselves through yoga, community and connection. We offer regular yoga sessions, and self-practice space for <strong>members</strong> and <strong>non-members</strong>. We are interactive. As a club, we operate <em>with</em> and <em>for</em> our members. In fact, it’s you, the members who create the experience.
          </p>
          <p>
            <strong>Yoga</strong> <em>in the</em> <strong>Stars</strong> is a project by <strong>The Metahealth Movement</strong>, a not-for-profit working towards elevating health towards alignment with our optimal potential.
          </p>
          <p className="serif italic text-3xl text-ink pt-1">The invitation is to evolve together.</p>
        </div>
      </section>

      {/* Schedule */}
      <section className="space-y-0">
        <SectionHead eyebrow="Visit us · What’s happening?" title="Our Schedule" action={{ href: "/schedule", label: "See live schedule now" }} />
        {week.length === 0 ? (
          <p className="py-8 text-ink-soft">This week’s sessions are being added. Check the full schedule.</p>
        ) : (
          <div>
            {week.map((s) => {
              const spaces = Math.max(0, s.capacity - s.booked);
              return (
                <Link key={s.id} href={`/classes/${s.id}`} className="grid grid-cols-[7rem_1fr_auto] sm:grid-cols-[9rem_1fr_1fr_10rem] gap-3 items-center py-4 border-b border-line hover:bg-bg-soft/60 -mx-2 px-2">
                  <div className="font-semibold text-sm">{fmtDate(s.starts_at, "EEE")} {fmtTime(s.starts_at)}</div>
                  <div className="serif text-2xl">{s.class_types.name}</div>
                  <div className="hidden sm:block text-sm text-ink-soft">
                    {s.teacher?.full_name ? `${s.teacher.full_name} · ` : ""}{Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000)} min · {pricingLabel(s)}
                  </div>
                  <div className="text-right text-sm">
                    <span className={spaces === 0 ? "text-orange" : spaces <= 3 ? "text-accent" : "text-ink-soft"}>
                      {spaces === 0 ? "Waitlist" : spaces <= 3 ? `${spaces} left` : "Open"}
                    </span>
                    {" · "}<strong>{s.pricing === "free" ? "Register" : "Book"}</strong>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        <p className="pt-4 text-sm text-ink-soft">
          Members and class pass holders book with one tap.
          {(passes ?? []).length > 0 && ` Non-members: ${passes!.map((p) => `${gbp(p.price_pence)} for ${p.credits} Class Pass`).join(", ")}.`}
          {" "}Booked and can’t make it? Cancel from My club so someone on the waitlist can come.
        </p>
      </section>

      {/* Things to know */}
      <section className="space-y-7">
        <SectionHead eyebrow="Join us" title="Things to know about Yoga in the Stars" />
        <div className="grid gap-5 md:grid-cols-3">
          <div id="yoga-social" className="bg-bg-soft p-7 flex flex-col gap-3 scroll-mt-32">
            <div className="caps text-accent">#1 · The Yoga-Social</div>
            <h3 className="text-3xl leading-tight">THE FREE YOGA-SOCIAL.</h3>
            <p className="text-sm leading-relaxed text-[#3d3831]">A <strong>free weekly meet-up</strong> and <strong>practice</strong>, funded by <strong>National Lottery Community Fund</strong>. Always free for everyone.</p>
            <p className="text-sm leading-relaxed text-[#3d3831]">Transformative experiences become more integrated when they are shared. Which is why establishing community around our practice is so important. The <strong>Yoga-Social</strong> is just that.</p>
            <p className="text-xs text-ink-soft">#NationalLottery and the National Lottery players, thank you!</p>
            <Link href={me ? "/schedule" : "/register?next=/schedule"} className="btn-primary self-start mt-auto">Register for free now</Link>
          </div>
          <div className="bg-ink text-bg p-7 flex flex-col gap-3">
            <div className="caps text-gold">#2 · Pay as you wish memberships</div>
            <h3 className="text-3xl leading-tight">DO THINGS DIFFERENTLY</h3>
            <p className="text-sm font-bold">Read this carefully.</p>
            <p className="text-sm leading-relaxed text-bg/85">INCLUSIVE: <strong>UNLIMITED SESSIONS / GUEST LIST YOUR FRIENDS + LOVED ONES /</strong> CURATE EVENTS WITH US <strong>/ USE THE PRACTICE SPACE AS YOUR <em>OWN</em></strong> FOR SELF-PRACTICE <strong>/ and FREE UPGRADE TO COUPLES MEMBERSHIP,</strong> SO YOU CAN COME WITH YOURS <strong>/</strong> plus much more.</p>
            <p className="text-sm leading-relaxed text-bg/85"><strong>Limited Offer: Full membership.</strong> Unlimited sessions <strong>1/2 Price (£39). Arrange a call or meet-up at the club.</strong></p>
            <Link href="/membership" className="mt-auto self-start inline-flex px-5 py-3 text-sm font-semibold bg-gold text-ink hover:opacity-90">Discover Half-price Memberships</Link>
          </div>
          <div className="bg-bg-soft p-7 flex flex-col gap-3">
            <div className="caps text-accent">Plus #3 · Free discovery meeting</div>
            <h3 className="text-3xl leading-tight">Find out what joining Yoga in the Stars can mean for <em>you.</em></h3>
            <p className="text-sm leading-relaxed text-[#3d3831]">We hold 1-1 Discovery + Vision Meetings to discover being part of Yoga in the Stars as a full member. Discovery meetings are usually 30 minutes. But we always make sure you get whatever time you need to get what you came for. <strong>Sign up and bring a journal if you wish</strong>.</p>
            <p className="text-xs font-bold tracking-wide">DISCOVERY MEETINGS ARE FREE and by REQUEST.</p>
            <a href={settings?.contact_whatsapp ? waLink(settings.contact_whatsapp, "Hi, I'd like to book a free discovery meeting.") : "/contact"} target="_blank" rel="noreferrer" className="btn-primary self-start mt-auto">Yes Please</a>
          </div>
        </div>

        {/* Tiers */}
        <div className="grid gap-8 lg:grid-cols-12 pt-2">
          <div className="lg:col-span-5 space-y-3">
            <div className="caps text-accent">Members &amp; non-members welcome</div>
            <h3 className="text-3xl leading-tight">Pay as you wish membership</h3>
            <p className="text-sm leading-relaxed text-[#3d3831]">As a not-for-profit, all proceeds invest in the future experience for the community that we create together. As a community we focus on the member experience.</p>
            <p className="text-sm leading-relaxed text-[#3d3831]">Whatever you choose to pay, all memberships are born equal. Cancel any time or switch when you need to.</p>
          </div>
          <div className="lg:col-span-7 space-y-4">
            {(plans ?? []).length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {plans!.map((p, i) => (
                  <Link key={p.id} href="/membership" className={`border border-ink p-5 flex flex-col gap-1 ${i === 1 ? "bg-ink text-bg" : ""}`}>
                    <div className="caps">{p.name}</div>
                    <div className="serif text-4xl">{gbp(p.price_pence)}<span className="font-sans text-sm">/{p.interval === "year" ? "yr" : "mo"}</span></div>
                  </Link>
                ))}
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-[#3d3831]">
              <div className="caps text-accent sm:col-span-2">As a member you get</div>
              <div>Unlimited sessions</div><div>Free access to curated happenings</div>
              <div>Guest list friends and loved ones</div><div>Book the studio for yourself and your friends</div>
              <div>Informal 1-1 sessions</div><div>Exclusive members only socials</div>
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <Link href="/membership" className="btn-primary">Become a member</Link>
              {(passes ?? []).length > 0 && (
                <span className="text-sm text-ink-soft">Non-members: {passes!.map((p) => `${gbp(p.price_pence)} for ${p.credits} Class Pass`).join(" · ")}</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Happenings */}
      <section className="space-y-6">
        <SectionHead eyebrow="Curated experiences" title="Happenings" action={{ href: "/events", label: "See all happenings" }} />
        {(events ?? []).length === 0 ? (
          <p className="text-ink-soft">The next happenings are being planned. Members hear first on the WhatsApp community.</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            {events!.map((e) => {
              const tickets = e.event_tickets ?? [];
              const from = tickets.length ? Math.min(...tickets.map((t) => t.price_pence)) : null;
              const memberFrom = tickets.length ? Math.min(...tickets.map((t) => t.member_price_pence ?? t.price_pence)) : null;
              return (
                <Link key={e.id} href={`/events/${e.slug}`} className="flex flex-col gap-2 group">
                  {e.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.image_url} alt="" className="h-64 w-full object-cover" />
                  ) : (
                    <div className="h-64 bg-bg-soft border border-line" />
                  )}
                  <div className="text-xs text-accent">{fmtDate(e.starts_at, "EEEE d MMMM")} · {fmtTime(e.starts_at)}</div>
                  <h3 className="text-2xl leading-tight group-hover:underline">{e.title}</h3>
                  {from != null && (
                    <div className="text-sm text-ink-soft">
                      {from === 0 ? "Free" : gbp(from)}
                      {memberFrom != null && memberFrom < from && <span> · members {memberFrom === 0 ? "free" : gbp(memberFrom)}</span>}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Reviews */}
      <section className="space-y-6">
        <div className="rule pt-4 space-y-2">
          <div className="flex items-center gap-2 text-gold">
            <span className="serif text-4xl text-ink leading-none">100%</span>
            <span className="flex gap-0.5"><Star /><Star /><Star /><Star /><Star /></span>
          </div>
          <h2 className="text-4xl sm:text-5xl leading-none">WHAT OUR MEMBERS SAY</h2>
        </div>
        <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map(([q, n]) => (
            <figure key={n} className="space-y-2">
              <blockquote className="serif italic text-2xl leading-snug">“{q}”</blockquote>
              <figcaption className="caps text-ink-soft">{n}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Teachers + Register */}
      <section className="grid gap-10 md:grid-cols-2">
        <div className="rule pt-4 space-y-3">
          <h2 className="text-4xl leading-tight">Yoga Teachers Come for Free</h2>
          <p className="leading-relaxed text-[#3d3831]">Yoga teachers, <strong>come for free.</strong> Get in touch to find out about <strong>Yoga</strong> <em>in the</em> <strong>Stars, free membership</strong> for Yoga Teachers.</p>
          <a href={settings?.contact_whatsapp ? waLink(settings.contact_whatsapp, "Hi, I'm a yoga teacher and I'd like to find out about free membership.") : "/contact"} target="_blank" rel="noreferrer" className="text-sm font-semibold underline underline-offset-4">Sign up</a>
        </div>
        <div className="rule pt-4 space-y-3">
          <div className="caps text-accent">And don’t forget</div>
          <h2 className="text-4xl leading-tight">REGISTER FOR FREE.</h2>
          <p className="leading-relaxed text-[#3d3831]">Once you have registered you can attend the FREE WEEKLY YOGA-SOCIALS, funded by the National Lottery, buy classes or become a member. Plus you get invites for special events and happenings.</p>
          <p className="text-sm text-ink-soft">Connect with our community on our socials linked below.</p>
          {!me && <Link href="/register" className="btn-primary self-start">Register for free</Link>}
        </div>
      </section>
    </div>
  );
}
