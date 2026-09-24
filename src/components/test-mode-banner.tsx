/**
 * Shown on every page while Stripe is in test mode, so nobody mistakes the
 * practice site for the real thing and testers know which card to use.
 * Disappears by itself when live Stripe keys go in.
 */
export function TestModeBanner() {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key.startsWith("sk_test_")) return null;
  return (
    <div role="note" className="w-full bg-[#fff3c4] text-[#4a3b00] border-b border-[#e8d58a] text-xs sm:text-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <strong className="font-semibold">Practice version.</strong>
        <span>No real money is taken and bookings here aren&apos;t real. Please keep booking on Momo for now.</span>
        <span className="whitespace-nowrap">
          Test card: <span className="font-mono">4242 4242 4242 4242</span>, any future date, any 3 digits.
        </span>
      </div>
    </div>
  );
}
