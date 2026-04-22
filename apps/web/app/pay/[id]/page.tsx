import { PublicPaymentPage } from "../../../components/public-payment-page";

export default async function HostedCheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PublicPaymentPage paymentId={id} />;
}
