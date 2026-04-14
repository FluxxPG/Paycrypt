import { notFound } from "next/navigation";
import { fetchJson } from "../../../lib/api";
import { PaymentLinkPanel } from "../../../components/payment-link-panel";

export default async function PaymentLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let paymentLink: any;
  try {
    paymentLink = await fetchJson(`/public/payment_links/${id}`);
  } catch {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
      <PaymentLinkPanel paymentLink={paymentLink} />
    </main>
  );
}
