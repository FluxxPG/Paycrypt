import { MerchantShell } from "../../../components/merchant-shell";
import { ReportsPanel } from "../../../components/reports-panel";

export default function ReportsPage() {
  return (
    <MerchantShell
      title="Reports"
      subtitle="Payment trends, webhook delivery, settlement state, and usage metering for the merchant account."
    >
      <ReportsPanel />
    </MerchantShell>
  );
}
