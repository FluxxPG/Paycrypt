import { AdminShell } from "../../../components/admin-shell";
import { AdminTreasuryPanel } from "../../../components/admin-treasury-panel";

export default function AdminTreasuryPage() {
  return (
    <AdminShell
      title="Treasury Control"
      subtitle="Monitor platform wallets, fee revenue, manual adjustments, and withdrawal approvals from the admin treasury desk."
    >
      <AdminTreasuryPanel />
    </AdminShell>
  );
}
