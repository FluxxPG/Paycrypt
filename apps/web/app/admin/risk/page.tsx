import { AdminShell } from "../../../components/admin-shell";
import { AdminRiskPanel } from "../../../components/admin-risk-panel";

export default function AdminRiskPage() {
  return (
    <AdminShell
      title="Risk & Alerts"
      subtitle="Queue health, webhook reliability, and live platform telemetry."
    >
      <AdminRiskPanel />
    </AdminShell>
  );
}
