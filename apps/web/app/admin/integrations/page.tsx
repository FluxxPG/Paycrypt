import { AdminShell } from "../../../components/admin-shell";
import { AdminIntegrationsPanel } from "../../../components/admin-integrations-panel";

export default function AdminIntegrationsPage() {
  return (
    <AdminShell
      title="Integration Control Center"
      subtitle="Govern merchant storefront integrations, monitor connection health, and enforce platform-wide policy controls."
    >
      <AdminIntegrationsPanel />
    </AdminShell>
  );
}

