"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Tables } from "@/lib/database.types";

type Props = { profile: Tables<"profiles"> | null };

const publicLinks = [
  { href: "/schedule", label: "Schedule" },
  { href: "/membership", label: "Membership" },
  { href: "/events", label: "Events" },
];

export function Nav({ profile }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = [...publicLinks];
  if (profile) links.push({ href: "/me", label: "My club" });
  if (profile && (profile.role === "teacher" || profile.role === "admin")) links.push({ href: "/teach", label: "Teach" });
  if (profile?.role === "admin") links.push({ href: "/admin", label: "Admin" });

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <Link href="/" className="serif text-lg font-semibold text-brand">
          Yoga in the Stars
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-3 py-1.5 text-sm ${
                pathname.startsWith(l.href) ? "bg-brand-soft text-brand" : "text-ink-soft hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          ))}
          {profile ? (
            <form action="/auth/signout" method="post" className="ml-2">
              <button className="btn-ghost text-sm">Sign out</button>
            </form>
          ) : (
            <Link href="/login" className="btn-primary ml-2">
              Sign in
            </Link>
          )}
        </nav>
        <button
          className="md:hidden rounded-full p-2 text-ink-soft"
          aria-label="Menu"
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-line bg-bg px-4 py-3 flex flex-col gap-1">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-2 text-sm hover:bg-bg-soft">
              {l.label}
            </Link>
          ))}
          {profile ? (
            <form action="/auth/signout" method="post">
              <button className="rounded-xl px-3 py-2 text-sm text-ink-soft w-full text-left">Sign out</button>
            </form>
          ) : (
            <Link href="/login" onClick={() => setOpen(false)} className="rounded-xl px-3 py-2 text-sm text-brand font-medium">
              Sign in
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
