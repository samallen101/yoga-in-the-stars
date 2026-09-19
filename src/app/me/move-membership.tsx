import { fmtDate, gbp } from "@/lib/format";
import { startPlanCheckout } from "@/app/membership/actions";

type Plan = { id: string; name: string; price_pence: number; interval: string };

/**
 * Shown to people whose membership came over from Momo. Their paid period is
 * honoured in full; the card they set up here is charged only from the day
 * after it ends.
 */
export function MoveMembershipCard({ legacyPlan, periodEnd, currentPlanId, plans }: { legacyPlan: string; periodEnd: string | null; currentPlanId: string | null; plans: Plan[] }) {
  const end = periodEnd ? fmtDate(periodEnd, "d MMMM") : null;
  const stillPaid = periodEnd ? new Date(periodEnd).getTime() > Date.now() + 49 * 3600_000 : false;
  return (
    <section className="card border-2 border-brand/40 space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-brand">One small thing: move your membership over</h2>
        <p className="text-sm text-ink-soft mt-2">
          Bookings have a new home and your {legacyPlan} came with us.
          {end && stillPaid ? (
            <> You are paid up until <span className="font-medium text-ink">{end}</span>. After that the old system stops renewing it, so to carry on without a gap set up your card here now. Nothing is charged until {end}.</>
          ) : (
            <> Your last paid period has ended, so to carry on choose a plan below and your membership picks up from today.</>
          )}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {plans.map((p) => (
          <form key={p.id} action={startPlanCheckout} className={`rounded-xl border p-4 flex flex-col ${p.id === currentPlanId ? "border-brand bg-brand/5" : "border-ink/10"}`}>
            <input type="hidden" name="plan_id" value={p.id} />
            <div className="font-semibold">{p.name}</div>
            <div className="text-2xl serif text-brand mt-1">{gbp(p.price_pence)}<span className="text-sm font-sans text-ink-soft">/{p.interval}</span></div>
            {p.id === currentPlanId && <div className="text-xs text-brand mt-1">Your current plan</div>}
            <button className={`mt-3 ${p.id === currentPlanId ? "btn-primary" : "btn-secondary"}`}>
              {stillPaid ? "Set up card" : "Continue"}
            </button>
          </form>
        ))}
      </div>
      <p className="text-xs text-ink-soft">Secure payment page from Stripe. You can change or cancel any time from this page afterwards. Questions? Message the team.</p>
    </section>
  );
}
