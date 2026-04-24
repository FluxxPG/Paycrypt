"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { HostedCheckoutPanel } from "../../../components/hosted-checkout-panel";
import { UPICheckoutPanel } from "../../../components/upi-checkout-panel";
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

const buildDemoUpiPayment = (status: DemoStatus) => ({
  id: "upi_demo_preview",
  merchant_id: "mrc_demo",
  amount_fiat: 999,
  fiat_currency: "INR",
  payment_method: "upi" as const,
  upi_provider: "phonepe",
  upi_transaction_id: "upi_demo_tx_1",
  upi_intent_url: "upi://pay?pa=merchant@upi&pn=Paycrypt%20Demo&am=999&cu=INR&tn=Demo%20UPI%20payment",
  upi_qr_code: "upi://pay?pa=merchant@upi&pn=Paycrypt%20Demo&am=999&cu=INR&tn=Demo%20UPI%20payment",
  upi_status: status === "confirmed" ? "success" : status === "failed" ? "failed" : "pending",
  description: "Demo UPI checkout preview (prefilled amount)",
  status,
  expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  success_url: "/preview/success",
  cancel_url: "/preview/cancel"
});

export default function DemoPreviewPage() {
  const [status, setStatus] = useState<DemoStatus>("created");
  const [method, setMethod] = useState<"crypto" | "upi">("crypto");
  const payment = useMemo(() => buildDemoPayment(status), [status]);
  const upiPayment = useMemo(() => buildDemoUpiPayment(status), [status]);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
      <div className="w-full space-y-4">
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant={method === "crypto" ? "default" : "secondary"} onClick={() => setMethod("crypto")}>
              Crypto demo
            </Button>
            <Button variant={method === "upi" ? "default" : "secondary"} onClick={() => setMethod("upi")}>
              UPI demo
            </Button>
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
        {method === "crypto" ? <HostedCheckoutPanel payment={payment as any} /> : <UPICheckoutPanel payment={upiPayment as any} />}
      </div>
    </main>
  );
}

