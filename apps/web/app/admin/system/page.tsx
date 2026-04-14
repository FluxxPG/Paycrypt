import { AdminShell } from "../../../components/admin-shell";
import { AdminSystemPanel } from "../../../components/admin-system-panel";
import { AdminCustodyPanel } from "../../../components/admin-custody-panel";

export default function AdminSystemPage() {
  return (
    <AdminShell
      title="System Monitoring"
      subtitle="Service uptime, queue health, and infrastructure readiness."
    >
      <div className="space-y-6">
        <AdminSystemPanel />
        <AdminCustodyPanel />
      </div>
    </AdminShell>
  );
}
