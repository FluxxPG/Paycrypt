"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Blocks,
  CheckCircle2,
  Globe,
  Lock,
  Shield,
  Sparkles,
  Wallet
} from "lucide-react";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6 } }
};

export default function HomePage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <section className="relative overflow-hidden rounded-[36px] border border-white/10 bg-hero-grid px-8 py-16 shadow-glow">
        <div className="pointer-events-none absolute -left-20 top-10 h-52 w-52 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 bottom-10 h-56 w-56 rounded-full bg-purple-500/20 blur-3xl" />
        <motion.div initial="hidden" animate="show" variants={fadeUp} className="max-w-5xl">
          <Badge className="glass-soft">Enterprise Crypto Payments</Badge>
          <h1 className="mt-6 text-5xl font-semibold tracking-tight text-white md:text-6xl">
            Crypto-native payment infrastructure with Stripe-grade reliability.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-300">
            Accept BTC, ETH, and USDT with custodial defaults, premium non-custodial wallets, real-time confirmations, hosted checkout, webhooks, and enterprise-grade controls.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/login" className="rounded-2xl bg-cyan-400 px-6 py-3 text-sm font-medium text-slate-950">
              Open Merchant Console
            </Link>
            <Link href="/admin/login" className="glass-soft rounded-2xl px-6 py-3 text-sm text-slate-100">
              Open Admin Command Deck
            </Link>
            <Link href="/login" className="glass-soft rounded-2xl px-6 py-3 text-sm text-slate-100">
              View Hosted Checkout
            </Link>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              { label: "Uptime SLA", value: "99.95%" },
              { label: "Avg confirm", value: "< 18s" },
              { label: "Webhook retries", value: "12x" }
            ].map((stat) => (
              <div key={stat.label} className="glass-soft rounded-2xl px-5 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{stat.label}</p>
                <p className="mt-3 text-2xl font-semibold text-white">{stat.value}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp}>
          <Card className="h-full">
            <div className="flex items-center gap-3 text-cyan-200">
              <Sparkles className="h-5 w-5" />
              <p className="text-sm">Realtime orchestration</p>
            </div>
            <h2 className="mt-6 text-3xl font-semibold text-white">Live payment signals, everywhere.</h2>
            <p className="mt-3 text-sm text-slate-300">
              Socket-powered streams update dashboards, hosted checkout, and webhook pipelines instantly with multi-confirmation
              support across TRON, Ethereum, and Solana networks.
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                { label: "payment.created", value: "120ms avg" },
                { label: "payment.pending", value: "real-time" },
                { label: "payment.confirmed", value: "multi-chain" }
              ].map((item) => (
                <div key={item.label} className="glass-soft rounded-2xl px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
                  <p className="mt-2 text-sm text-white">{item.value}</p>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp}>
          <Card className="h-full">
            <div className="flex items-center gap-3 text-cyan-200">
              <Blocks className="h-5 w-5" />
              <p className="text-sm">Wallet strategy</p>
            </div>
            <h2 className="mt-6 text-2xl font-semibold text-white">Custodial defaults, premium non-custodial unlock.</h2>
            <p className="mt-3 text-sm text-slate-300">
              Binance custodial wallets are provisioned automatically. Super admins can unlock non-custodial TRON, ETH, and SOL
              wallets with premium pricing controls per merchant.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-300">
              {["TRC20", "ERC20", "SOL", "BTC", "ETH", "USDT"].map((item) => (
                <span key={item} className="glass-soft rounded-full px-3 py-1">
                  {item}
                </span>
              ))}
            </div>
          </Card>
        </motion.div>
      </section>

      <section className="mt-10 grid gap-6 md:grid-cols-3">
        {[
          {
            title: "API-grade controls",
            icon: BarChart3,
            text: "Scoped API keys, idempotency protection, and usage throttles built for scale."
          },
          {
            title: "Zero-trust security",
            icon: Shield,
            text: "JWT auth, HMAC webhooks, encrypted secrets, and audit-grade logging."
          },
          {
            title: "Global checkout",
            icon: Globe,
            text: "Hosted checkout with network-aware QR codes, expiry timers, and status transitions."
          }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <motion.div key={item.title} initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp}>
              <Card>
                <Icon className="h-8 w-8 text-cyan-300" />
                <h2 className="mt-6 text-xl font-medium text-white">{item.title}</h2>
                <p className="mt-2 text-sm text-slate-300">{item.text}</p>
                <div className="mt-6 inline-flex items-center gap-2 text-sm text-cyan-200">
                  Production-ready orchestration <ArrowRight className="h-4 w-4" />
                </div>
              </Card>
            </motion.div>
          );
        })}
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp}>
          <Card className="h-full">
            <div className="flex items-center gap-3 text-cyan-200">
              <Lock className="h-5 w-5" />
              <p className="text-sm">Compliance & trust</p>
            </div>
            <h2 className="mt-6 text-3xl font-semibold text-white">Enterprise guardrails, built in.</h2>
            <p className="mt-3 text-sm text-slate-300">
              Role-based access, signed webhooks, encrypted secrets, and audit trails for every admin action. Track usage,
              billing, and rate limits from a single command deck.
            </p>
            <div className="mt-6 space-y-3 text-sm text-slate-300">
              {[
                "Multi-tenant safeguards with per-merchant entitlements.",
                "HMAC webhook verification with retry backoff.",
                "BullMQ orchestration for confirmations and settlements."
              ].map((line) => (
                <div key={line} className="flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  <span>{line}</span>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp}>
          <Card className="h-full">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-cyan-200">Developer workflow</p>
                <h2 className="mt-3 text-2xl font-semibold text-white">SDK-first integrations</h2>
              </div>
              <Badge className="glass-soft">Node SDK</Badge>
            </div>
            <div className="mt-6 rounded-2xl bg-slate-950/60 p-5 text-sm text-slate-200">
              <pre className="whitespace-pre-wrap">{`import { CryptoPay } from "@cryptopay/sdk";

const client = new CryptoPay("sk_live_xxx");
const intent = await client.payment.create({
  amount: 2450,
  currency: "USDT",
  network: "TRC20"
});`}</pre>
            </div>
            <div className="mt-6 flex flex-wrap gap-3 text-xs text-slate-400">
              {["Type-safe", "Idempotent", "Retry-aware", "Environment scoped"].map((item) => (
                <span key={item} className="glass-soft rounded-full px-3 py-1">
                  {item}
                </span>
              ))}
            </div>
          </Card>
        </motion.div>
      </section>

      <section className="mt-12">
        <Card className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <p className="text-sm text-cyan-200">Ready to launch</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">Activate your crypto payment stack today.</h2>
            <p className="mt-2 text-sm text-slate-300">
              Spin up the merchant dashboard, explore real-time confirmations, and configure admin approvals.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/login" className="rounded-2xl bg-cyan-400 px-6 py-3 text-sm font-medium text-slate-950">
              Merchant Login
            </Link>
            <Link href="/admin/login" className="glass-soft rounded-2xl px-6 py-3 text-sm text-slate-100">
              Admin Login
            </Link>
          </div>
        </Card>
      </section>
    </main>
  );
}
