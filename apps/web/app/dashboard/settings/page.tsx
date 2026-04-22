import { MerchantShell } from "../../../components/merchant-shell";
import { MerchantSettingsPanel } from "../../../components/merchant-settings-panel";

export default function SettingsPage() {
  return (
    <MerchantShell
      title="Checkout Settings"
      subtitle="Control accepted currencies and networks, then preview the exact hosted checkout your payer will see."
    >
      <MerchantSettingsPanel />
    </MerchantShell>
  );
}
