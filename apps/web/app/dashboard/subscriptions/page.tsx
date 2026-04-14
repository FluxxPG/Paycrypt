import { MerchantShell } from "../../../components/merchant-shell";
import { SubscriptionPanel } from "../../../components/subscription-panel";

export default function SubscriptionsPage() {
  return (
    <MerchantShell
      title="Billing"
      subtitle="Plan management, usage metering, and feature entitlement controls."
    >
      <SubscriptionPanel />
    </MerchantShell>
  );
}
