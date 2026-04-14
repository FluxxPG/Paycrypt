import { AdminShell } from "../../../components/admin-shell";
import { AdminRevenuePanel } from "../../../components/admin-revenue-panel";

export default function AdminRevenuePage() {
  return (
    <AdminShell
      title="Revenue & Billing"
      subtitle="Track subscription MRR, invoices, and plan performance across the platform."
    >
      <AdminRevenuePanel />
    </AdminShell>
  );
}
