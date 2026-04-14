import Link from "next/link";
import type { ReactNode } from "react";
import { Activity, CreditCard, KeyRound, ReceiptText, ShieldCheck, Wallet } from "lucide-react";
import { Badge } from "./ui/badge";
import { SessionControls } from "./session-controls";

const nav = [
  { href: "/dashboard", label: "Overview", icon: Activity },
  { href: "/dashboard/payments", label: "Payments", icon: CreditCard },
  { href: "/dashboard/subscriptions", label: "Billing", icon: ShieldCheck },
  { href: "/dashboard/settlements", label: "Settlements", icon: ReceiptText },
  { href: "/dashboard/wallets", label: "Wallets", icon: Wallet },
  { href: "/dashboard/reports", label: "Reports", icon: Activity },
  { href: "/dashboard/api-keys", label: "API Keys", icon: KeyRound },
  { href: "/dashboard/webhooks", label: "Webhooks", icon: CreditCard },
  { href: "/admin", label: "Admin", icon: ShieldCheck }
];

export const Shell = ({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) => (
  <div className="mx-auto min-h-screen max-w-7xl px-6 py-10">
    <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <Badge>CryptoPay Cloud</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">{subtitle}</p>
      </div>
      <div className="flex flex-col items-start gap-4">
        <SessionControls />
        <nav className="flex flex-wrap gap-3">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="glass-soft flex items-center gap-2 rounded-2xl px-4 py-3 text-sm text-slate-200"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
    {children}
  </div>
);
