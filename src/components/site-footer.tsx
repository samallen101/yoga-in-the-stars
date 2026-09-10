import type { Tables } from "@/lib/database.types";

export function SiteFooter({ settings }: { settings: Tables<"settings"> | null }) {
  const links = [
    settings?.youtube_url && { label: "YouTube", href: settings.youtube_url },
    settings?.facebook_url && { label: "Facebook", href: settings.facebook_url },
    settings?.instagram_url && { label: "Instagram", href: settings.instagram_url },
    settings?.contact_whatsapp && { label: "WhatsApp", href: waLink(settings.contact_whatsapp) },
  ].filter(Boolean) as { label: string; href: string }[];
  return (
    <footer className="border-t-2 border-ink">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-wrap justify-between gap-4 text-xs text-ink-soft">
        <div>WWW.YOGAINTHESTARS.COM | The Metahealth Movement LTD | © 2022 · <a href="/privacy" className="underline">Privacy Policy</a></div>
        <div className="flex gap-5">
          {links.map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="hover:text-ink">{l.label}</a>
          ))}
        </div>
      </div>
    </footer>
  );
}

export function waLink(number: string, text?: string) {
  const digits = number.replace(/[^0-9]/g, "");
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
