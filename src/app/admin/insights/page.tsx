import { getInsights } from "@/lib/insights";
import { PageHeader } from "@/components/ui";
import InsightsCharts from "./insights-charts";
import { requireAdminPage } from "@/lib/admin-guard";

export const metadata = { title: "Insights" };
export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  await requireAdminPage("/admin/insights");
  const data = await getInsights();
  return (
    <div>
      <PageHeader title="Insights" intro="Everything the club has done since 2022, from the Momo records: money, members, who comes back, and who has drifted." />
      <InsightsCharts data={data} />
    </div>
  );
}
