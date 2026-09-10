import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { SiteFooter } from "@/components/site-footer";
import { createAdminClient, getCurrentUser } from "@/lib/supabase/server";

const sans = Instrument_Sans({ variable: "--font-instrument-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const serif = Instrument_Serif({ variable: "--font-instrument-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: { default: "Yoga in the Stars", template: "%s · Yoga in the Stars" },
  description: "A Million Miles away from a yoga studio. Not-for-profit yoga club in Leytonstone with more than 20 sessions a week, pay as you wish membership and a free weekly Yoga-Social.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [me, { data: settings }] = await Promise.all([
    getCurrentUser(),
    createAdminClient().from("settings").select("*").eq("id", 1).single(),
  ]);
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Nav profile={me?.profile ?? null} promoText={settings?.promo_text ?? null} promoUrl={settings?.promo_url ?? "/membership"} />
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">{children}</main>
        <SiteFooter settings={settings} />
      </body>
    </html>
  );
}
