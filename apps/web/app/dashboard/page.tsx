import { MerchantShell } from "../../components/merchant-shell";
import { DashboardOverviewPanel } from "../../components/dashboard-overview-panel";

export default function DashboardPage() {
  return (
    <MerchantShell
      title="Merchant Command Center"
      subtitle="Monitor payment flow, wallet infrastructure, API usage, and subscription state from a single realtime operations surface."
    >
      <DashboardOverviewPanel />
    </MerchantShell>
  );
}
