import { createAdminClient } from "@/lib/supabase/server";
import { waLink } from "@/components/site-footer";

export const metadata = { title: "Contact us" };

export default async function ContactPage() {
  const { data: s } = await createAdminClient().from("settings").select("*").eq("id", 1).single();
  const address = s?.address_line ?? "Upstairs The Heathcote and Star, 344 Grove Green Road, E11 4EA";
  const mapQuery = encodeURIComponent("The Heathcote and Star, 344 Grove Green Road, London E11 4EA");
  return (
    <div className="grid gap-10 lg:grid-cols-12">
      <div className="lg:col-span-5 space-y-5">
        <h1 className="text-5xl leading-none">Contact us</h1>
        <p className="leading-relaxed text-[#3d3831]">
          {address}.<br />Mon–Sat and occasional Sunday offerings.
        </p>
        <div className="flex flex-wrap gap-3">
          {s?.contact_whatsapp && (
            <a href={waLink(s.contact_whatsapp, "Hi Yoga in the Stars, ")} target="_blank" rel="noreferrer" className="btn-primary">WhatsApp us</a>
          )}
          {s?.contact_email && <a href={`mailto:${s.contact_email}`} className="btn-secondary">Email us</a>}
        </div>
        <p className="text-sm text-ink-soft">
          Want to talk before joining? <strong>Discovery meetings are free and by request.</strong> Message us and we’ll find a time.
        </p>
        <div className="flex gap-5 text-sm">
          {s?.instagram_url && <a className="underline underline-offset-4" href={s.instagram_url} target="_blank" rel="noreferrer">Instagram</a>}
          {s?.facebook_url && <a className="underline underline-offset-4" href={s.facebook_url} target="_blank" rel="noreferrer">Facebook</a>}
          {s?.youtube_url && <a className="underline underline-offset-4" href={s.youtube_url} target="_blank" rel="noreferrer">YouTube</a>}
        </div>
      </div>
      <div className="lg:col-span-7">
        <iframe
          title="Map"
          className="w-full h-80 lg:h-[28rem] border border-line"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
        />
      </div>
    </div>
  );
}
