"use client";

import { useEffect, useState } from "react";
import { PaymentLinkPanel } from "./payment-link-panel";
import { Card } from "./ui/card";
import { getApiBaseUrl } from "../lib/runtime-config";

export const PublicPaymentLinkPage = ({ paymentLinkId }: { paymentLinkId: string }) => {
  const [paymentLink, setPaymentLink] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    fetch(`${getApiBaseUrl()}/public/payment_links/${paymentLinkId}`, {
      cache: "no-store"
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.message ?? "Payment link not found");
        }
        return payload;
      })
      .then((payload) => {
        if (mounted) setPaymentLink(payload);
      })
      .catch((fetchError) => {
        if (mounted) setError(fetchError instanceof Error ? fetchError.message : "Payment link not found");
      });

    return () => {
      mounted = false;
    };
  }, [paymentLinkId]);

  if (error) {
    return (
      <main className="mx-auto flex min-h-screen max-w-4xl items-center px-6 py-12">
        <Card className="w-full p-8">
          <p className="text-sm uppercase tracking-[0.24em] text-rose-200">Payment link unavailable</p>
          <h1 className="mt-4 text-3xl font-semibold text-white">This link could not be loaded.</h1>
          <p className="mt-3 text-sm text-slate-300">{error}</p>
        </Card>
      </main>
    );
  }

  if (!paymentLink) {
    return (
      <main className="mx-auto flex min-h-screen max-w-4xl items-center px-6 py-12">
        <Card className="w-full p-8">
          <p className="text-sm uppercase tracking-[0.24em] text-cyan-200">Loading payment link</p>
          <h1 className="mt-4 text-3xl font-semibold text-white">Preparing secure checkout.</h1>
          <p className="mt-3 text-sm text-slate-300">Fetching the latest payment-link configuration.</p>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
      <PaymentLinkPanel paymentLink={paymentLink} />
    </main>
  );
};
