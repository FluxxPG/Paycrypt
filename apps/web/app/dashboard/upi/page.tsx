import { UPISettingsPanel } from "../../../components/upi-settings-panel";
import { MerchantShell } from "../../../components/merchant-shell";

export default function UPIPage() {
  return (
    <MerchantShell
      title="UPI Settings"
      subtitle="Configure UPI provider credentials, routing, manual fallback, and webhook security from your merchant console."
    >
      <UPISettingsPanel />
    </MerchantShell>
  );
}
