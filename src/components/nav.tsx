"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Tables } from "@/lib/database.types";

type Props = { profile: Tables<"profiles"> | null; promoText: string | null; promoUrl: string };

const publicLinks = [
  { href: "/membership", label: "Memberships" },
  { href: "/schedule", label: "Schedule" },
  { href: "/events", label: "Happenings" },
  { href: "/#yoga-social", label: "Yoga-Social" },
  { href: "/contact", label: "Contact us" },
];

export function Nav({ profile, promoText, promoUrl }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = [...publicLinks];
  if (profile) links.push({ href: "/me", label: "My club" });
  if (profile && (profile.role === "teacher" || profile.role === "admin")) links.push({ href: "/teach", label: "Teach" });
  if (profile?.role === "admin") links.push({ href: "/admin", label: "Admin" });

  const active = (href: string) => {
    const base = href.split("#")[0];
    return base !== "/" && (pathname === base || pathname.startsWith(base + "/"));
  };

  return (
    <header className="sticky top-0 z-30 bg-bg/95 backdrop-blur border-b-2 border-ink">
      {promoText && (
        <div className="bg-ink text-bg text-xs sm:text-sm">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-4">
            <p className="leading-snug">{promoText}</p>
            <Link href={promoUrl} className="shrink-0 underline font-semibold">Find out more</Link>
          </div>
        </div>
      )}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="serif text-2xl leading-none text-ink">
          <strong className="font-normal">YOGA</strong> <em>in the</em> <strong className="font-normal">STARS</strong>
        </Link>
        <nav className="hidden lg:flex items-center gap-5">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`caps ${active(l.href) ? "text-ink border-b-2 border-accent" : "text-ink-soft hover:text-ink"}`}>
              {l.label}
            </Link>
          ))}
          {profile ? (
            <form action="/auth/signout" method="post">
              <button className="caps text-accent">Sign out</button>
            </form>
          ) : (
            <>
              <Link href="/login" className="caps text-accent">Sign in</Link>
              <Link href="/register" className="btn-primary py-2.5">Register for free</Link>
            </>
          )}
        </nav>
        <button className="lg:hidden p-2 text-ink" aria-label="Menu" onClick={() => setOpen((v) => !v)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      {open && (
        <div className="lg:hidden border-t border-line bg-bg px-4 py-3 flex flex-col gap-1">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="px-3 py-2 caps hover:bg-bg-soft">
              {l.label}
            </Link>
          ))}
          {profile ? (
            <form action="/auth/signout" method="post">
              <button className="px-3 py-2 caps text-accent w-full text-left">Sign out</button>
            </form>
          ) : (
            <>
              <Link href="/login" onClick={() => setOpen(false)} className="px-3 py-2 caps text-accent">Sign in</Link>
              <Link href="/register" onClick={() => setOpen(false)} className="btn-primary mt-2">Register for free</Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}
