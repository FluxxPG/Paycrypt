import { MerchantShell } from "../../../components/merchant-shell";
import { WalletsPanel } from "../../../components/wallets-panel";

export default function WalletsPage() {
  return (
    <MerchantShell
      title="Wallet Infrastructure"
      subtitle="Manage custodial routing and review premium non-custodial availability by chain."
    >
      <WalletsPanel />
    </MerchantShell>
  );
}
