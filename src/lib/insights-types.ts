// Shared between the server aggregation and the client charts (no server-only imports here).

export type Category = "Memberships" | "Class passes" | "Drop-ins" | "Sessions & events" | "Breathwork & retreats" | "Other";
export const CATEGORIES: Category[] = ["Memberships", "Class passes", "Drop-ins", "Sessions & events", "Breathwork & retreats", "Other"];

export type Monthly = {
  month: string;
  revenue: Record<Category, number>;
  revenueTotal: number;
  orders: number;
  payers: number;
  newPayers: number;
  failed: number;
  paidMembers: number;
  freeMembers: number;
  newRegistrations: number;
};

export type Insights = {
  generatedAt: string;
  totals: {
    people: number; withPhone: number; active: number; paidNow: number; freeNow: number; passesWithCredits: number;
    revenue12m: number; revenuePrev12m: number; avgMonthly12m: number; failed60d: number; orders: number; lifetimeRevenue: number;
  };
  monthly: Monthly[];
  recency: { bucket: string; people: number }[];
  topOptions: { name: string; category: Category; revenue: number; orders: number; avg: number }[];
  paymentMethods: { method: string; orders: number; revenue: number }[];
  promoCodes: { code: string; uses: number; discount: number }[];
  retention: { cohort: string; size: number; m1: number | null; m3: number | null; m6: number | null; m12: number | null }[];
  retentionCurve: { month: number; retained: number }[];
  ltv: { bucket: string; people: number }[];
  topPeople: { id: string; name: string; spend: number; orders: number; lastClass: string | null; status: string | null }[];
  tenure: { bucket: string; members: number }[];
  areas: { area: string; people: number }[];
  ages: { bucket: string; people: number }[];
  weekday: { day: string; orders: number }[];
};

