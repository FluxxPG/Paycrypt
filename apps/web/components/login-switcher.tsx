"use client";

import { useMemo, useState } from "react";
import { ShieldCheck, Store } from "lucide-react";
import { LoginForm } from "./login-form";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";

type Variant = "merchant" | "admin";

const variantCopy: Record<Variant, { title: string; description: string }> = {
  merchant: {
    title: "Merchant Console",
    description: "Manage payments, wallets, and API keys for your storefront."
  },
  admin: {
    title: "Admin Control",
    description: "Oversee merchants, subscriptions, and wallet entitlements."
  }
};

export const LoginSwitcher = () => {
  const [variant, setVariant] = useState<Variant>("merchant");
  const copy = useMemo(() => variantCopy[variant], [variant]);

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center gap-3 border border-white/10 bg-white/5 p-2">
        {([
          { id: "merchant" as const, label: "Merchant", icon: Store },
          { id: "admin" as const, label: "Admin", icon: ShieldCheck }
        ] as const).map((item) => {
          const active = variant === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setVariant(item.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm transition ${
                active ? "bg-cyan-400 text-slate-950" : "text-slate-200 hover:bg-white/10"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </Card>

      <div className="glass-soft rounded-3xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-400">Selected</p>
            <h2 className="text-xl font-semibold text-white">{copy.title}</h2>
            <p className="mt-2 text-sm text-slate-300">{copy.description}</p>
          </div>
          <Badge>{variant === "merchant" ? "Live Storefront" : "Super Admin"}</Badge>
        </div>
      </div>

      <LoginForm variant={variant} />
    </div>
  );
};
