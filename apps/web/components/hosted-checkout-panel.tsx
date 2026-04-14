"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Wallet } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { RealtimePayment } from "./realtime-payment";

type CheckoutPayment = {
  id: string;
  merchant_id: string;
  amount_fiat: number | string;
  amount_crypto: number | string;
  exchange_rate: number | string;
  quote_source: string;
  quoted_at: string;
  fiat_currency: string;
  settlement_currency: string;
  network: string;
  description: string;
  wallet_address: string;
  wallet_routes: Record<
    string,
    {
      asset: string;
      network: string;
      address: string;
      provider?: string;
      walletType?: string;
      amountCrypto?: number | string;
      exchangeRate?: number | string;
    }
  >;
  status: string;
  expires_at: string;
  success_url: string;
  cancel_url: string;
};

export const HostedCheckoutPanel = ({ payment }: { payment: CheckoutPayment }) => {
  const routes = useMemo(() => Object.values(payment.wallet_routes ?? {}), [payment.wallet_routes]);
  const [selectedNetwork, setSelectedNetwork] = useState(payment.network);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.floor((new Date(payment.expires_at).getTime() - Date.now()) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [payment.expires_at]);

  const activeRoute =
    payment.wallet_routes[selectedNetwork] ??
    routes[0] ??
    {
      asset: payment.settlement_currency,
      network: payment.network,
      address: payment.wallet_address,
      provider: "binance",
      walletType: "custodial",
      amountCrypto: payment.amount_crypto,
      exchangeRate: payment.exchange_rate
    };
  const cryptoAmount = Number(activeRoute.amountCrypto ?? payment.amount_crypto);
  const exchangeRate = Number(activeRoute.exchangeRate ?? payment.exchange_rate);

  return (
    <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <Card className="p-8">
        <Badge className="mb-4">Hosted Checkout</Badge>
        <h1 className="text-4xl font-semibold text-white">Complete your crypto payment</h1>
        <p className="mt-2 text-slate-300">{payment.description}</p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="glass-soft rounded-2xl p-4">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Wallet className="h-4 w-4" /> Crypto
            </div>
            <p className="mt-3 text-xl font-medium text-white">{payment.settlement_currency}</p>
            <p className="mt-2 text-xs text-slate-500">
              {activeRoute.provider ?? payment.quote_source} -{" "}
              {String(activeRoute.walletType ?? "custodial").replace("_", " ")}
            </p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <div className="flex items-center gap-2 text-sm text-slate-300">Expires</div>
            <p className="mt-3 text-xl font-medium text-white">
              {Math.floor(secondsLeft / 60)}m {secondsLeft % 60}s
            </p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-sm text-slate-400">Network</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {routes.map((route) => (
              <button
                key={route.network}
                type="button"
                onClick={() => setSelectedNetwork(route.network)}
                className={`rounded-2xl px-4 py-2 text-sm transition ${
                  selectedNetwork === route.network ? "bg-cyan-400 text-slate-950" : "glass-soft text-slate-100"
                }`}
              >
                {route.network}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 glass-soft rounded-3xl p-5">
          <div className="flex items-center justify-between text-sm text-slate-400">
            <span>Wallet address</span>
            <button
              type="button"
              className="inline-flex items-center gap-2 text-cyan-200"
              onClick={() => navigator.clipboard.writeText(activeRoute.address)}
            >
              <Copy className="h-4 w-4" /> Copy
            </button>
          </div>
          <p className="mt-3 break-all font-mono text-sm text-white">{activeRoute.address}</p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Quote</p>
            <p className="mt-2 text-lg text-white">
              {cryptoAmount.toLocaleString("en-US", { maximumFractionDigits: 8 })} {payment.settlement_currency}
            </p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Rate</p>
            <p className="mt-2 text-lg text-white">
              {Number(payment.amount_fiat).toLocaleString("en-IN")} {payment.fiat_currency}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              1 {payment.settlement_currency} = {exchangeRate.toLocaleString("en-IN")} {payment.fiat_currency}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3 text-sm text-slate-300">
          <RealtimePayment
            paymentId={payment.id}
            merchantId={payment.merchant_id}
            initialStatus={payment.status}
            successUrl={payment.success_url}
            cancelUrl={payment.cancel_url}
          />
          <span>Real-time payment updates are active.</span>
        </div>
      </Card>

      <Card className="flex flex-col items-center justify-center p-8 text-center">
        <QRCodeSVG value={activeRoute.address} size={220} bgColor="transparent" fgColor="#ffffff" />
        <p className="mt-6 text-3xl font-semibold text-white">
          {payment.fiat_currency} {Number(payment.amount_fiat).toLocaleString("en-IN")}
        </p>
        <p className="mt-2 text-sm text-slate-300">
          Pay {cryptoAmount.toLocaleString("en-US", { maximumFractionDigits: 8 })} {payment.settlement_currency}
        </p>
        <p className="mt-2 text-sm text-slate-300">
          Status: <span className="capitalize text-cyan-200">{payment.status}</span>
        </p>
        <div className="mt-6 w-full space-y-3 text-left text-sm text-slate-300">
          <div className="glass-soft rounded-2xl p-4">1. Send the exact amount on the selected network.</div>
          <div className="glass-soft rounded-2xl p-4">2. Wait for confirmations and webhook dispatch.</div>
          <div className="glass-soft rounded-2xl p-4">3. Success and failure redirects are ready.</div>
        </div>
      </Card>
    </div>
  );
};
