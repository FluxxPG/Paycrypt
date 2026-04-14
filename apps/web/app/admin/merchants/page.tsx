import { AdminShell } from "../../../components/admin-shell";
import { AdminMerchantsPanel } from "../../../components/admin-merchants-panel";

export default function AdminMerchantsPage() {
  return (
    <AdminShell
      title="Merchant Management"
      subtitle="Provision, suspend, and manage wallet entitlements for every merchant."
    >
      <AdminMerchantsPanel />
    </AdminShell>
  );
}
