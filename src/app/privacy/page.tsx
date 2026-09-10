export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-5xl leading-none">Privacy Policy</h1>
      <p className="text-sm text-ink-soft">Yoga in the Stars is a project of The Metahealth Movement LTD. This page explains what we hold about you and why. Draft for review; last updated September 2026.</p>
      <div className="space-y-4 leading-relaxed text-[#3d3831]">
        <p><strong>What we collect.</strong> When you register we keep your name, email address and, if you give it, your mobile number. When you book, buy a class pass, join as a member or buy a ticket we keep a record of that booking or purchase. Card details are handled by Stripe and never stored by us.</p>
        <p><strong>What we use it for.</strong> Running your bookings and membership, telling you about changes to classes you are booked on, reminders, receipts, and, if you have said yes, club news and happenings by email or WhatsApp. You can change your WhatsApp and marketing preferences any time in My club.</p>
        <p><strong>Who we share it with.</strong> Stripe (payments), Supabase (our database, hosted in London), Vercel (hosting), Resend (email) and Meta (WhatsApp messages you have opted into). We do not sell or rent your details.</p>
        <p><strong>How long we keep it.</strong> For as long as you have an account with us. Ask and we will delete it.</p>
        <p><strong>Your rights.</strong> You can ask to see, correct or delete what we hold about you. Contact us through the details on the Contact page.</p>
      </div>
    </div>
  );
}
