import { MerchantShell } from "../../../components/merchant-shell";
import { TransactionsPanel } from "../../../components/transactions-panel";

export default function TransactionsPage() {
  return (
    <MerchantShell
      title="Transactions"
      subtitle="On-chain confirmations and hashes for every payment."
    >
      <TransactionsPanel />
    </MerchantShell>
  );
}
