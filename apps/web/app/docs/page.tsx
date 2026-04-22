import Link from "next/link";
import { ArrowRight, Blocks, Code2, Globe, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Card } from "../../components/ui/card";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://d1jm86cy6nqs8t.cloudfront.net";
const appBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://paycrypt-web-live.vercel.app";

const codeSamples = {
  paymentIntent: `curl -X POST "${apiBaseUrl}/v1/payments" \\
  -H "Authorization: Bearer sk_live_xxx" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: intent_001" \\
  -d '{
    "amountFiat": 2499,
    "fiatCurrency": "INR",
    "description": "Nebula AI subscription renewal",
    "successUrl": "${appBaseUrl}/success",
    "cancelUrl": "${appBaseUrl}/cancel"
  }'`,
  explicitRoute: `{
  "amountFiat": 2499,
  "fiatCurrency": "INR",
  "settlementCurrency": "USDT",
  "network": "TRC20",
  "description": "Nebula AI subscription renewal",
  "successUrl": "${appBaseUrl}/success",
  "cancelUrl": "${appBaseUrl}/cancel"
}`,
  paymentLink: `curl -X POST "${apiBaseUrl}/v1/payment_links" \\
  -H "Authorization: Bearer sk_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Global annual plan",
    "description": "Hosted checkout for annual plan",
    "amountFiat": 49999,
    "fiatCurrency": "INR",
    "successUrl": "${appBaseUrl}/success",
    "cancelUrl": "${appBaseUrl}/cancel"
  }'`,
  nodeSdk: `import { createClient } from "@cryptopay/sdk";

const client = createClient({
  secretKey: "sk_live_xxx",
  baseUrl: "${apiBaseUrl}"
});

const intent = await client.payment.create({
  amountFiat: 2499,
  fiatCurrency: "INR",
  description: "Nebula AI subscription renewal",
  successUrl: "${appBaseUrl}/success",
  cancelUrl: "${appBaseUrl}/cancel"
});`
};

const routeRows = [
  {
    asset: "BTC",
    networks: "BTC",
    checkout: "Custodial default path",
    notes: "Always custodial in this platform model."
  },
  {
    asset: "ETH",
    networks: "ERC20",
    checkout: "Custodial or approved non-custodial",
    notes: "Non-custodial only appears after super-admin enablement."
  },
  {
    asset: "USDT",
    networks: "TRC20, ERC20, SOL",
    checkout: "Custodial or approved non-custodial",
    notes: "Merchant accepted-route settings decide which networks are exposed."
  }
];

export default function DeveloperDocsPage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <section className="relative overflow-hidden rounded-[36px] border border-white/10 bg-hero-grid px-8 py-16 shadow-glow">
        <div className="pointer-events-none absolute -left-16 top-12 h-48 w-48 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-12 h-56 w-56 rounded-full bg-blue-500/15 blur-3xl" />
        <Badge className="glass-soft">Developer Docs</Badge>
        <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-tight text-white md:text-6xl">
          Route-aware crypto checkout docs for merchants, SDKs, and hosted payment flows.
        </h1>
        <p className="mt-4 max-w-3xl text-lg text-slate-300">
          Use the Paycrypt API to create payment intents and payment links, let the merchant default route drive checkout
          when you omit route fields, or override the route explicitly when you need a fixed asset and network.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/login" className="rounded-2xl bg-cyan-400 px-6 py-3 text-sm font-medium text-slate-950">
            Merchant login
          </Link>
          <Link href="/dashboard/settings" className="glass-soft rounded-2xl px-6 py-3 text-sm text-slate-100">
            Checkout settings
          </Link>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            { label: "API base", value: apiBaseUrl.replace("https://", "") },
            { label: "Hosted checkout", value: "/pay/:id" },
            { label: "Fallback route", value: "Merchant default" }
          ].map((item) => (
            <div key={item.label} className="glass-soft rounded-2xl px-5 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
              <p className="mt-3 text-base font-semibold text-white">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-3">
        {[
          {
            icon: Sparkles,
            title: "Default route fallback",
            text: "If you omit settlementCurrency and network, Paycrypt resolves the checkout using the merchant's saved default route."
          },
          {
            icon: Blocks,
            title: "Accepted routes are enforced",
            text: "Explicit requests still have to match the merchant's enabled assets and networks or the API returns checkout_route_disabled."
          },
          {
            icon: ShieldCheck,
            title: "Admin-gated non-custodial",
            text: "Non-custodial ETH, TRON, and Solana routes only appear after super-admin entitlement plus merchant wallet onboarding."
          }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.title}>
              <Icon className="h-8 w-8 text-cyan-300" />
              <h2 className="mt-5 text-xl font-medium text-white">{item.title}</h2>
              <p className="mt-2 text-sm text-slate-300">{item.text}</p>
            </Card>
          );
        })}
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <Card>
          <div className="flex items-center gap-3 text-cyan-200">
            <Globe className="h-5 w-5" />
            <p className="text-sm">Checkout behavior</p>
          </div>
          <h2 className="mt-5 text-3xl font-semibold text-white">How accepted routes affect hosted checkout</h2>
          <div className="mt-6 space-y-4 text-sm text-slate-300">
            <div className="glass-soft rounded-2xl p-4">
              1. Merchant settings define the accepted asset and network combinations that can appear in checkout.
            </div>
            <div className="glass-soft rounded-2xl p-4">
              2. The merchant default route determines the first payer-selected asset and network when a route is not passed explicitly.
            </div>
            <div className="glass-soft rounded-2xl p-4">
              3. If your API call sends a route, Paycrypt uses it as long as it is still enabled for that merchant.
            </div>
            <div className="glass-soft rounded-2xl p-4">
              4. If the chosen wallet route is temporarily unavailable, the API returns <code>checkout_route_unavailable</code> instead of inventing a route.
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-cyan-200">Route matrix</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">Supported assets and gating model</h2>
            </div>
            <Badge className="glass-soft">Live policy</Badge>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-white/10 bg-white/5">
                <tr>
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3">Networks</th>
                  <th className="px-4 py-3">Checkout path</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {routeRows.map((row) => (
                  <tr key={row.asset} className="border-b border-white/5">
                    <td className="px-4 py-4 text-white">{row.asset}</td>
                    <td className="px-4 py-4">{row.networks}</td>
                    <td className="px-4 py-4">{row.checkout}</td>
                    <td className="px-4 py-4 text-slate-400">{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-3 text-cyan-200">
            <Code2 className="h-5 w-5" />
            <p className="text-sm">API example</p>
          </div>
          <h2 className="mt-5 text-2xl font-semibold text-white">Create a payment intent with merchant default routing</h2>
          <p className="mt-2 text-sm text-slate-400">
            Omit the route fields and let the merchant's default asset and network preselect the checkout.
          </p>
          <pre className="mt-6 overflow-x-auto rounded-3xl bg-slate-950/70 p-5 text-xs text-slate-200">
            {codeSamples.paymentIntent}
          </pre>
        </Card>

        <Card>
          <div className="flex items-center gap-3 text-cyan-200">
            <Code2 className="h-5 w-5" />
            <p className="text-sm">Override example</p>
          </div>
          <h2 className="mt-5 text-2xl font-semibold text-white">Pin a specific asset and network</h2>
          <p className="mt-2 text-sm text-slate-400">
            Pass an explicit route when the payment must settle on a known pair such as USDT on TRC20.
          </p>
          <pre className="mt-6 overflow-x-auto rounded-3xl bg-slate-950/70 p-5 text-xs text-slate-200">
            {codeSamples.explicitRoute}
          </pre>
        </Card>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <Card>
          <p className="text-sm text-cyan-200">Payment links</p>
          <h2 className="mt-5 text-2xl font-semibold text-white">Hosted payment link creation</h2>
          <pre className="mt-6 overflow-x-auto rounded-3xl bg-slate-950/70 p-5 text-xs text-slate-200">
            {codeSamples.paymentLink}
          </pre>
        </Card>

        <Card>
          <p className="text-sm text-cyan-200">Node SDK</p>
          <h2 className="mt-5 text-2xl font-semibold text-white">Type-safe server integration</h2>
          <pre className="mt-6 overflow-x-auto rounded-3xl bg-slate-950/70 p-5 text-xs text-slate-200">
            {codeSamples.nodeSdk}
          </pre>
        </Card>
      </section>

      <section className="mt-10">
        <Card className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <p className="text-sm text-cyan-200">Next step</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">Configure accepted routes, then preview a real checkout.</h2>
            <p className="mt-2 text-sm text-slate-300">
              Merchant settings control payer-visible routes. The preview tool creates a live checkout so the QR, address,
              timer, and WebSocket status reflect the actual platform behavior.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/settings" className="rounded-2xl bg-cyan-400 px-6 py-3 text-sm font-medium text-slate-950">
              Open checkout settings
            </Link>
            <Link href="/login" className="glass-soft rounded-2xl px-6 py-3 text-sm text-slate-100">
              Merchant console <ArrowRight className="ml-2 inline h-4 w-4" />
            </Link>
          </div>
        </Card>
      </section>
    </main>
  );
}
