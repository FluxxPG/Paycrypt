import { PublicPaymentLinkPage } from "../../../components/public-payment-link-page";

export default async function PaymentLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PublicPaymentLinkPage paymentLinkId={id} />;
}
