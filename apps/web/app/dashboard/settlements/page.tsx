import { MerchantShell } from "../../../components/merchant-shell";
import { SettlementsPanel } from "../../../components/settlements-panel";

export default function SettlementsPage() {
  return (
    <MerchantShell
      title="Settlements"
      subtitle="Track finalized crypto settlements with provider, hash, and payment reconciliation details."
    >
      <SettlementsPanel />
    </MerchantShell>
  );
}
