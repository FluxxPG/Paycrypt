"use client";

import { useEffect, useState } from "react";
import { HostedCheckoutPanel } from "./hosted-checkout-panel";
import { UPICheckoutPanel } from "./upi-checkout-panel";
import { Card } from "./ui/card";
import { getApiBaseUrl } from "../lib/runtime-config";

export const PublicPaymentPage = ({ paymentId }: { paymentId: string }) => {
  const [payment, setPayment] = useState<any | null>(null);
  const [dual, setDual] = useState<{ crypto: any | null; upi: any | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadPayment = async () => {
      const dualResponse = await fetch(`${getApiBaseUrl()}/public/payments/${paymentId}/dual`, { cache: "no-store" });
      if (dualResponse.ok) {
        return dualResponse.json();
      }
      const fallbackResponse = await fetch(`${getApiBaseUrl()}/public/payments/${paymentId}`, { cache: "no-store" });
      const fallbackPayload = await fallbackResponse.json().catch(() => null);
      if (!fallbackResponse.ok) {
        throw new Error(fallbackPayload?.message ?? "Payment not found");
      }
      return { crypto: fallbackPayload, upi: null };
    };
    loadPayment()
      .then((payload) => {
        if (!mounted) return;
        setDual(payload as any);
        setPayment((payload as any)?.upi ?? (payload as any)?.crypto ?? null);
      })
      .catch((fetchError) => {
        if (mounted) setError(fetchError instanceof Error ? fetchError.message : "Payment not found");
      });

    return () => {
      mounted = false;
    };
  }, [paymentId]);

  if (error) {
    return (
      <main className="mx-auto flex min-h-screen max-w-4xl items-center px-6 py-12">
        <Card className="w-full p-8">
          <p className="text-sm uppercase tracking-[0.24em] text-rose-200">Checkout unavailable</p>
          <h1 className="mt-4 text-3xl font-semibold text-white">This payment could not be loaded.</h1>
          <p className="mt-3 text-sm text-slate-300">{error}</p>
        </Card>
      </main>
    );
  }

  if (!payment) {
    return (
      <main className="mx-auto flex min-h-screen max-w-4xl items-center px-6 py-12">
        <Card className="w-full p-8">
          <p className="text-sm uppercase tracking-[0.24em] text-cyan-200">Loading checkout</p>
          <h1 className="mt-4 text-3xl font-semibold text-white">Preparing your payment session.</h1>
          <p className="mt-3 text-sm text-slate-300">Fetching the latest wallet route, quote, and countdown.</p>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
      {dual?.crypto && dual?.upi ? (
        <div className="w-full space-y-10">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Dual checkout</p>
            <h1 className="mt-3 text-3xl font-semibold text-white">Pay with Crypto or UPI</h1>
            <p className="mt-2 text-sm text-slate-300">Choose either method below. Amount is prefilled by the merchant.</p>
          </div>
          <HostedCheckoutPanel payment={dual.crypto} />
          <UPICheckoutPanel payment={dual.upi} />
        </div>
      ) : payment?.payment_method === "upi" ? (
        <UPICheckoutPanel payment={payment} />
      ) : (
        <HostedCheckoutPanel payment={payment} />
      )}
    </main>
  );
};
