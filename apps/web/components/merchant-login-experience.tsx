"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, BarChart3, CheckCircle2, Globe, Shield, Sparkles, Wallet, Zap } from "lucide-react";
import { LoginForm } from "./login-form";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

const metrics = [
  { label: "Merchant access", value: "JWT protected" },
  { label: "Realtime delivery", value: "Socket enabled" },
  { label: "Wallet routing", value: "Custody aware" }
];

const features = [
  {
    title: "Realtime payment orchestration",
    text: "Track pending, confirmed, and failed states across hosted checkout, merchant analytics, and webhook delivery.",
    icon: Zap
  },
  {
    title: "Wallet and settlement visibility",
    text: "Monitor custodial balances, premium non-custodial access, settlement windows, and payment health from one console.",
    icon: Wallet
  },
  {
    title: "Global-grade control surface",
    text: "API keys, payment links, usage analytics, and audit-aware reporting sit behind a JWT-secured merchant session.",
    icon: Shield
  }
];

const rails = ["BTC", "ETH", "USDT", "TRC20", "ERC20", "SOL", "Webhooks", "Socket Streams"];

export const MerchantLoginExperience = () => (
  <main className="relative isolate min-h-screen overflow-hidden">
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute left-[-10%] top-[-12%] h-[30rem] w-[30rem] rounded-full bg-cyan-500/18 blur-3xl" />
      <div className="absolute right-[-12%] top-[8%] h-[28rem] w-[28rem] rounded-full bg-violet-500/16 blur-3xl" />
      <div className="absolute bottom-[-14%] left-[18%] h-[26rem] w-[26rem] rounded-full bg-sky-500/10 blur-3xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_22%),linear-gradient(180deg,rgba(2,6,23,0.18),rgba(2,6,23,0.72))]" />
    </div>

    <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8">
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="flex items-center justify-between"
      >
        <Link href="/" className="inline-flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-lg font-semibold text-cyan-200">
            P
          </span>
          <div>
            <p className="text-sm font-medium text-white">PayCrypt Cloud</p>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Merchant Console</p>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <Badge className="hidden sm:inline-flex">JWT protected access</Badge>
          <Link href="/" className="glass-soft rounded-full px-4 py-2 text-sm text-slate-200 transition hover:text-white">
            Back to site
          </Link>
        </div>
      </motion.header>

      <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="max-w-3xl"
          >
            <Badge>Global crypto commerce</Badge>
            <h1 className="mt-6 text-5xl font-semibold tracking-[-0.04em] text-white md:text-7xl">
              Run your merchant payment stack from a single crypto-native control plane.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              Accept crypto with a hosted checkout, live confirmations, wallet-aware settlement flows, and developer-grade
              APIs designed for merchants operating across borders.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08 }}
            className="mt-8 grid gap-4 sm:grid-cols-3"
          >
            {metrics.map((metric) => (
              <Card key={metric.label} className="rounded-[28px] border-white/12 bg-white/[0.04] p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{metric.label}</p>
                <p className="mt-3 text-3xl font-semibold text-white">{metric.value}</p>
              </Card>
            ))}
          </motion.div>

          <div className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <motion.div
              initial={{ opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.14 }}
            >
              <Card className="rounded-[32px] border-white/12 bg-white/[0.045] p-7">
                <div className="flex items-center gap-3 text-cyan-200">
                  <Sparkles className="h-5 w-5" />
                  <p className="text-sm">Merchant operating layer</p>
                </div>
                <div className="mt-6 space-y-5">
                  {features.map((feature) => {
                    const Icon = feature.icon;

                    return (
                      <div key={feature.title} className="rounded-2xl border border-white/8 bg-slate-950/35 p-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
                            <Icon className="h-5 w-5" />
                          </span>
                          <div>
                            <p className="text-base font-medium text-white">{feature.title}</p>
                            <p className="mt-1 text-sm leading-6 text-slate-300">{feature.text}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.18 }}
              className="space-y-4"
            >
              <Card className="rounded-[32px] border-white/12 bg-white/[0.05] p-6">
                <div className="flex items-center gap-3 text-cyan-200">
                  <BarChart3 className="h-5 w-5" />
                  <p className="text-sm">What merchants get</p>
                </div>
                <div className="mt-5 space-y-4">
                  {[
                    "Dashboard analytics for payments, settlement flow, and payment link performance.",
                    "Realtime websocket updates for checkout status and transaction progression.",
                    "API key management, webhooks, wallet visibility, and usage-aware reporting."
                  ].map((line) => (
                    <div key={line} className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />
                      <p className="text-sm leading-6 text-slate-300">{line}</p>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="rounded-[32px] border-white/12 bg-white/[0.04] p-6">
                <div className="flex items-center gap-3 text-cyan-200">
                  <Globe className="h-5 w-5" />
                  <p className="text-sm">Active rails and services</p>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {rails.map((rail) => (
                    <span key={rail} className="glass-soft rounded-full px-3 py-1.5 text-xs text-slate-200">
                      {rail}
                    </span>
                  ))}
                </div>
                <div className="mt-6 inline-flex items-center gap-2 text-sm text-cyan-200">
                  Open the merchant console
                  <ArrowRight className="h-4 w-4" />
                </div>
              </Card>
            </motion.div>
          </div>
        </section>

        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.62, delay: 0.12 }}
          className="relative"
        >
          <div className="absolute -left-6 top-10 hidden h-28 w-28 rounded-full border border-cyan-400/20 bg-cyan-400/8 blur-2xl lg:block" />
          <div className="absolute -right-6 bottom-16 hidden h-24 w-24 rounded-full border border-violet-400/20 bg-violet-400/8 blur-2xl lg:block" />
          <LoginForm variant="merchant" />
        </motion.section>
      </div>
    </div>
  </main>
);
