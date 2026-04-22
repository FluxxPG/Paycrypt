"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { getApiBaseUrl } from "../lib/runtime-config";

type PaymentLink = {
  id: string;
  merchant_id: string;
  title: string;
  description: string;
  amount_fiat: number | string;
  fiat_currency: string;
  settlement_currency: string;
  network: string;
  success_url: string;
  cancel_url: string;
};

export const PaymentLinkPanel = ({ paymentLink }: { paymentLink: PaymentLink }) => {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openCheckout = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/public/payment_links/${paymentLink.id}/checkout`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          credentials: "include"
        }
      );
      const payload = (await response.json()) as { checkoutUrl: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "Failed to create checkout");
      }
      router.push(payload.checkoutUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create checkout");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Badge className="mb-4">Payment Link</Badge>
          <h1 className="text-3xl font-semibold text-white">{paymentLink.title}</h1>
          <p className="mt-2 text-sm text-slate-300">{paymentLink.description}</p>
        </div>
        <Badge>{paymentLink.network}</Badge>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="glass-soft rounded-2xl p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Amount</p>
          <p className="mt-2 text-2xl text-white">
            {Number(paymentLink.amount_fiat).toLocaleString("en-IN")} {paymentLink.fiat_currency}
          </p>
        </div>
        <div className="glass-soft rounded-2xl p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Settlement</p>
          <p className="mt-2 text-2xl text-white">{paymentLink.settlement_currency}</p>
        </div>
      </div>

      <div className="mt-8 flex items-center gap-4">
        <Button onClick={openCheckout} disabled={busy}>
          {busy ? "Creating checkout..." : "Open secure checkout"}
        </Button>
        {error ? <span className="text-sm text-rose-300">{error}</span> : null}
      </div>
    </Card>
  );
};
