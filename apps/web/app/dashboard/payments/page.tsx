import { MerchantShell } from "../../../components/merchant-shell";
import { DashboardPaymentsPanel } from "../../../components/dashboard-payments-panel";

export default function PaymentsPage() {
  return (
    <MerchantShell
      title="Payments"
      subtitle="Work from one canonical ledger with payment state, settlement state, wallet source, and on-chain details together."
    >
      <DashboardPaymentsPanel />
    </MerchantShell>
  );
}
