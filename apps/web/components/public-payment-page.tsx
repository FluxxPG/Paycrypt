"use client";

import { useEffect, useState } from "react";
import { HostedCheckoutPanel } from "./hosted-checkout-panel";
import { Card } from "./ui/card";
import { getApiBaseUrl } from "../lib/runtime-config";

export const PublicPaymentPage = ({ paymentId }: { paymentId: string }) => {
  const [payment, setPayment] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    fetch(`${getApiBaseUrl()}/public/payments/${paymentId}`, {
      cache: "no-store"
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.message ?? "Payment not found");
        }
        return payload;
      })
      .then((payload) => {
        if (mounted) setPayment(payload);
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
      <HostedCheckoutPanel payment={payment} />
    </main>
  );
};
