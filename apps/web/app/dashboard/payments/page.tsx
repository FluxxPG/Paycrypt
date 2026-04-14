import { MerchantShell } from "../../../components/merchant-shell";
import { DashboardPaymentsPanel } from "../../../components/dashboard-payments-panel";

export default function PaymentsPage() {
  return (
    <MerchantShell
      title="Payments"
      subtitle="Track intent creation, chain settlement, confirmations, and customer checkout state."
    >
      <DashboardPaymentsPanel />
    </MerchantShell>
  );
}
