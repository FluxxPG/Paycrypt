import { MerchantShell } from "../../../components/merchant-shell";
import { MerchantTreasuryPanel } from "../../../components/merchant-treasury-panel";

export default function TreasuryPage() {
  return (
    <MerchantShell
      title="Merchant Treasury"
      subtitle="Track pending credits, withdrawable balances, fee deductions, and treasury outflows in one ledger-driven view."
    >
      <MerchantTreasuryPanel />
    </MerchantShell>
  );
}
