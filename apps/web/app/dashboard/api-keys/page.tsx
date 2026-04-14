import { MerchantShell } from "../../../components/merchant-shell";
import { ApiKeysPanel } from "../../../components/api-keys-panel";

export default function ApiKeysPage() {
  return (
    <MerchantShell
      title="API Keys"
      subtitle="Issue scoped keys, rotate secrets, and monitor usage lanes for developer integrations."
    >
      <ApiKeysPanel />
    </MerchantShell>
  );
}
