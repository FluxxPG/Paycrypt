import { AdminShell } from "../../../components/admin-shell";
import { AdminApiKeysPanel } from "../../../components/admin-api-keys-panel";

export default function AdminApiKeysPage() {
  return (
    <AdminShell
      title="API Keys"
      subtitle="Issue, rotate, and revoke API keys across merchants."
    >
      <AdminApiKeysPanel />
    </AdminShell>
  );
}
