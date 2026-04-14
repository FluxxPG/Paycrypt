import { AdminShell } from "../../../components/admin-shell";
import { AdminWebhooksPanel } from "../../../components/admin-webhooks-panel";

export default function AdminWebhooksPage() {
  return (
    <AdminShell
      title="Webhook Management"
      subtitle="Monitor endpoints, rotate secrets, and pause deliveries."
    >
      <AdminWebhooksPanel />
    </AdminShell>
  );
}
