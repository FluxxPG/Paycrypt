import { fetchJson } from "../../../lib/api";
import { notFound } from "next/navigation";
import { HostedCheckoutPanel } from "../../../components/hosted-checkout-panel";

export default async function HostedCheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let payment: any;
  try {
    payment = await fetchJson(`/public/payments/${id}`);
  } catch {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
      <HostedCheckoutPanel payment={payment} />
    </main>
  );
}
