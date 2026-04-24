import { AdminUPIPanel } from "../../../components/admin-upi-panel";
import { AdminShell } from "../../../components/admin-shell";

export default function AdminUPIPage() {
  return (
    <AdminShell
      title="UPI Management"
      subtitle="Monitor UPI health, merchant access controls, provider coverage, and platform-wide payment performance."
    >
      <AdminUPIPanel />
    </AdminShell>
  );
}
