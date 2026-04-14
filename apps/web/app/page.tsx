import Link from "next/link";
import { ArrowRight, BarChart3, Shield, Wallet } from "lucide-react";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-hero-grid px-8 py-14 shadow-glow">
        <Badge>Enterprise Crypto Payments</Badge>
        <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-tight text-white">
          Stripe-style payment infrastructure for crypto-native businesses.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-300">
          Accept BTC, ETH, and USDT through custodial or premium non-custodial flows with realtime status, hosted checkout, webhooks, and merchant-grade controls.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/dashboard" className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-medium text-slate-950">
            Open Merchant Dashboard
          </Link>
          <Link href="/admin" className="glass-soft rounded-2xl px-5 py-3 text-sm text-slate-100">
            Open Admin Console
          </Link>
        </div>
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-3">
        {[
          { title: "Realtime orchestration", icon: BarChart3, text: "Socket-based payment state propagation with Redis-backed workers." },
          { title: "Wallet controls", icon: Wallet, text: "Custodial by default with per-merchant non-custodial premium access." },
          { title: "Defense in depth", icon: Shield, text: "JWT auth, rotating API keys, HMAC webhooks, idempotency, and usage limits." }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.title}>
              <Icon className="h-8 w-8 text-cyan-300" />
              <h2 className="mt-6 text-xl font-medium text-white">{item.title}</h2>
              <p className="mt-2 text-sm text-slate-300">{item.text}</p>
              <div className="mt-6 inline-flex items-center gap-2 text-sm text-cyan-200">
                Production-focused foundation <ArrowRight className="h-4 w-4" />
              </div>
            </Card>
          );
        })}
      </section>
    </main>
  );
}
