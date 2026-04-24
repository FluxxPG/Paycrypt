"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AlertTriangle, Banknote, Gauge, KeyRound, Link2, ShieldCheck, Smartphone, Users, Wallet, Webhook } from "lucide-react";
import { SessionControls } from "./session-controls";
import { Badge } from "./ui/badge";

const adminNav = [
  { href: "/admin", label: "Control Room", icon: ShieldCheck },
  { href: "/admin/merchants", label: "Merchants", icon: Users },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: Gauge },
  { href: "/admin/wallets", label: "Wallets", icon: Wallet },
  { href: "/admin/custody", label: "Custody", icon: Banknote },
  { href: "/admin/api-keys", label: "API Keys", icon: KeyRound },
  { href: "/admin/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/admin/system", label: "System", icon: ShieldCheck },
  { href: "/admin/revenue", label: "Revenue", icon: Gauge },
  { href: "/admin/risk", label: "Risk & Alerts", icon: AlertTriangle },
  { href: "/admin/upi", label: "UPI", icon: Smartphone },
  { href: "/admin/integrations", label: "Integrations", icon: Link2 }
];

const Brand = () => (
  <div className="flex items-center gap-3">
    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-amber-400/80 via-orange-500/80 to-rose-500/80 text-sm font-semibold text-slate-950 shadow-glow">
      CP
    </div>
    <div>
      <p className="text-sm font-semibold text-white">CryptoPay</p>
      <p className="text-xs text-slate-400">Admin Control</p>
    </div>
  </div>
);

export const AdminShell = ({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) => {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <div className="flex">
        <aside className="glass hidden min-h-screen w-72 flex-col gap-8 px-6 py-8 lg:flex">
          <Brand />
          <div className="space-y-3">
            {adminNav.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm ${
                    active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
          <div className="mt-auto space-y-4">
            <Badge className="w-fit">Super Admin</Badge>
            <p className="text-xs text-slate-500">Govern merchants, wallets, pricing, and system health.</p>
          </div>
        </aside>

        <div className="flex-1">
          <header className="sticky top-0 z-20 border-b border-white/5 bg-slate-950/70 backdrop-blur-xl">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
              <div className="flex items-center gap-3 lg:hidden">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-amber-400/80 via-orange-500/80 to-rose-500/80 text-xs font-semibold text-slate-950">
                  CP
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">CryptoPay</p>
                  <p className="text-xs text-slate-400">Admin Control</p>
                </div>
              </div>
              <SessionControls />
            </div>
          </header>

          <div className="border-b border-white/5 bg-slate-950/40 px-6 py-4 lg:hidden">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {adminNav.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`glass-soft flex items-center gap-2 rounded-full px-4 py-2 text-xs ${
                      active ? "text-white" : "text-slate-300"
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <main className="mx-auto max-w-6xl px-6 py-10">
            <div className="mb-8">
              <h1 className="text-3xl font-semibold text-white lg:text-4xl">{title}</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">{subtitle}</p>
            </div>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};
