import { AdminShell } from "../../components/admin-shell";
import { AdminPanel } from "../../components/admin-panel";

export default function AdminPage() {
  return (
    <AdminShell
      title="Platform Admin"
      subtitle="Govern merchant onboarding, plans, wallet entitlements, system revenue, and network health."
    >
      <AdminPanel />
    </AdminShell>
  );
}
