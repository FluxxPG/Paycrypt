"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  Activity,
  Banknote,
  CreditCard,
  FileText,
  KeyRound,
  ReceiptText,
  ShieldCheck,
  Wallet
} from "lucide-react";
import { SessionControls } from "./session-controls";
import { Badge } from "./ui/badge";

const navSections = [
  {
    label: "Core",
    items: [
      { href: "/dashboard", label: "Overview", icon: Activity },
      { href: "/dashboard/payments", label: "Payments", icon: CreditCard },
      { href: "/dashboard/settlements", label: "Settlements", icon: ReceiptText },
      { href: "/dashboard/wallets", label: "Wallets", icon: Wallet }
    ]
  },
  {
    label: "Growth",
    items: [
      { href: "/dashboard/subscriptions", label: "Billing", icon: ShieldCheck },
      { href: "/dashboard/reports", label: "Reports", icon: FileText }
    ]
  },
  {
    label: "Developer",
    items: [
      { href: "/dashboard/api-keys", label: "API Keys", icon: KeyRound },
      { href: "/dashboard/webhooks", label: "Webhooks", icon: Banknote }
    ]
  }
];

const Brand = () => (
  <div className="flex items-center gap-3">
    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400/80 via-blue-500/80 to-purple-500/80 text-sm font-semibold text-slate-950 shadow-glow">
      CP
    </div>
    <div>
      <p className="text-sm font-semibold text-white">CryptoPay</p>
      <p className="text-xs text-slate-400">Merchant Console</p>
    </div>
  </div>
);

export const MerchantShell = ({
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
          <div className="space-y-6">
            {navSections.map((section) => (
              <div key={section.label}>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{section.label}</p>
                <div className="mt-3 space-y-2">
                  {section.items.map((item) => {
                    const active = pathname === item.href;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
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
              </div>
            ))}
          </div>
          <div className="mt-auto space-y-4">
            <Badge className="w-fit">Live environment</Badge>
            <p className="text-xs text-slate-500">Realtime settlement + wallet monitoring active.</p>
          </div>
        </aside>

        <div className="flex-1">
          <header className="sticky top-0 z-20 border-b border-white/5 bg-slate-950/70 backdrop-blur-xl">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
              <div className="flex items-center gap-3 lg:hidden">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400/80 via-blue-500/80 to-purple-500/80 text-xs font-semibold text-slate-950">
                  CP
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">CryptoPay</p>
                  <p className="text-xs text-slate-400">Merchant Console</p>
                </div>
              </div>
              <SessionControls />
            </div>
          </header>

          <div className="border-b border-white/5 bg-slate-950/40 px-6 py-4 lg:hidden">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {navSections.flatMap((section) => section.items).map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
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
