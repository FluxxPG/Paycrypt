import { AdminShell } from "../../../components/admin-shell";
import { AdminCustodyPanel } from "../../../components/admin-custody-panel";

export default function AdminCustodyPage() {
  return (
    <AdminShell
      title="Custodial Treasury"
      subtitle="Monitor Binance custodial balances and inbound deposit activity."
    >
      <AdminCustodyPanel />
    </AdminShell>
  );
}
