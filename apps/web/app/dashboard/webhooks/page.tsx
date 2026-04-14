import { MerchantShell } from "../../../components/merchant-shell";
import { WebhooksPanel } from "../../../components/webhooks-panel";

export default function WebhooksPage() {
  return (
    <MerchantShell
      title="Webhooks"
      subtitle="Manage event subscriptions, endpoint ownership, and revocation controls."
    >
      <WebhooksPanel />
    </MerchantShell>
  );
}
