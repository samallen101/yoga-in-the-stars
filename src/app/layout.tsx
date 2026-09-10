import type { Metadata } from "next";
import { Geist, Fraunces } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { getCurrentUser } from "@/lib/supabase/server";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["opsz"] });

export const metadata: Metadata = {
  title: { default: "Yoga in the Stars", template: "%s · Yoga in the Stars" },
  description: "A community yoga club in London. Classes, memberships, events and pay-as-you-wish sessions.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const me = await getCurrentUser();
  return (
    <html lang="en" className={`${geist.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Nav profile={me?.profile ?? null} />
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">{children}</main>
        <footer className="border-t border-line py-8 text-center text-xs text-ink-soft">
          Yoga in the Stars · a not-for-profit community yoga club
        </footer>
      </body>
    </html>
  );
}
