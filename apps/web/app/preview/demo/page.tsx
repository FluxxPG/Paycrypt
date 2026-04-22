"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { HostedCheckoutPanel } from "../../../components/hosted-checkout-panel";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";

type DemoStatus = "created" | "pending" | "confirmed" | "failed" | "expired";

const buildDemoPayment = (status: DemoStatus) => ({
  id: "pay_demo_preview",
  merchant_id: "mrc_demo",
  amount_fiat: 2499,
  amount_crypto: 30.125,
  exchange_rate: 82.95,
  quote_source: "coingecko",
  quoted_at: new Date().toISOString(),
  fiat_currency: "INR",
  settlement_currency: "USDT",
  network: "TRC20",
  description: "Demo payer preview (no live wallet required)",
  wallet_address: "TXYZ-demo-address-8b2f5b1",
  wallet_routes: {
    TRC20: {
      asset: "USDT",
      network: "TRC20",
      address: "TXYZ-demo-address-8b2f5b1",
      provider: "demo",
      walletType: "custodial",
      amountCrypto: 30.125,
      exchangeRate: 82.95
    }
  },
  status,
  expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  success_url: "/preview/success",
  cancel_url: "/preview/cancel"
});

export default function DemoPreviewPage() {
  const [status, setStatus] = useState<DemoStatus>("created");
  const payment = useMemo(() => buildDemoPayment(status), [status]);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
      <div className="w-full space-y-4">
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => setStatus("created")} disabled={status === "created"}>
              Set created
            </Button>
            <Button variant="secondary" onClick={() => setStatus("pending")} disabled={status === "pending"}>
              Set pending
            </Button>
            <Button onClick={() => setStatus("confirmed")} disabled={status === "confirmed"}>
              Set confirmed
            </Button>
            <Button variant="secondary" onClick={() => setStatus("failed")} disabled={status === "failed"}>
              Set failed
            </Button>
            <Button variant="secondary" onClick={() => setStatus("expired")} disabled={status === "expired"}>
              Set expired
            </Button>
            <Link
              href="/preview/success"
              className="glass-soft inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium text-slate-100"
            >
              Open success screen
            </Link>
            <Link
              href="/preview/cancel"
              className="glass-soft inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium text-slate-100"
            >
              Open cancel screen
            </Link>
          </div>
        </Card>
        <HostedCheckoutPanel payment={payment as any} />
      </div>
    </main>
  );
}

