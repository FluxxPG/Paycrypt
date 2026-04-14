import { AdminShell } from "../../../components/admin-shell";
import { AdminSubscriptionsPanel } from "../../../components/admin-subscriptions-panel";

export default function AdminSubscriptionsPage() {
  return (
    <AdminShell
      title="Subscription Management"
      subtitle="Plan overrides, custom pricing, and transaction limits."
    >
      <AdminSubscriptionsPanel />
    </AdminShell>
  );
}
