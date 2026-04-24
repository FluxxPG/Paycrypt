import { MerchantShell } from "../../../components/merchant-shell";
import { MerchantIntegrationsPanel } from "../../../components/merchant-integrations-panel";

export default function MerchantIntegrationsPage() {
  return (
    <MerchantShell
      title="Store Integrations"
      subtitle="Connect Shopify, WooCommerce, WordPress, and OpenCart stores with one-click onboarding and managed syncing."
    >
      <MerchantIntegrationsPanel />
    </MerchantShell>
  );
}

