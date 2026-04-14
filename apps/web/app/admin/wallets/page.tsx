import { AdminShell } from "../../../components/admin-shell";
import { AdminWalletsPanel } from "../../../components/admin-wallets-panel";

export default function AdminWalletsPage() {
  return (
    <AdminShell
      title="Wallet Management"
      subtitle="Custodial defaults, non-custodial approvals, and wallet inventory control."
    >
      <AdminWalletsPanel />
    </AdminShell>
  );
}
