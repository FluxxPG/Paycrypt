"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Wallet } from "lucide-react";
import { apiFetch } from "../lib/authed-fetch";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

type WalletRow = {
  id: string;
  payment_id: string | null;
  wallet_type: "custodial" | "non_custodial";
  provider: string;
  asset: string;
  network: string;
  address: string;
  is_active: boolean;
  is_selected: boolean;
  last_seen_at: string | null;
  created_at: string;
  payment_count: number;
  confirmed_count: number;
};

export const WalletsPanel = () => {
  const [wallets, setWallets] = useState<WalletRow[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    apiFetch<{ data: WalletRow[] }>("/dashboard/wallets")
      .then((payload) => {
        if (mounted) setWallets(payload.data);
      })
      .catch(() => {
        if (mounted) setWallets([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const summary = useMemo(() => {
    const rows = wallets ?? [];
    return {
      active: rows.filter((row) => row.is_active).length,
      selected: rows.filter((row) => row.is_selected).length,
      custodial: rows.filter((row) => row.wallet_type === "custodial").length,
      nonCustodial: rows.filter((row) => row.wallet_type === "non_custodial").length
    };
  }, [wallets]);

  const copyAddress = async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopied(address);
    window.setTimeout(() => setCopied(null), 1500);
  };

  if (!wallets) {
    return <Card>Loading wallet inventory...</Card>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-medium text-white">Wallet posture</p>
            <p className="text-sm text-slate-400">Track active addresses and route inventory in realtime.</p>
          </div>
          <Wallet className="h-5 w-5 text-cyan-300" />
        </div>
        <div className="mt-6 grid gap-3">
          <div className="glass-soft rounded-2xl p-4 text-sm text-slate-300">
            Active routes: <span className="text-white">{summary.active}</span>
          </div>
          <div className="glass-soft rounded-2xl p-4 text-sm text-slate-300">
            Selected routes: <span className="text-white">{summary.selected}</span>
          </div>
          <div className="glass-soft rounded-2xl p-4 text-sm text-slate-300">
            Custodial: <span className="text-white">{summary.custodial}</span>
          </div>
          <div className="glass-soft rounded-2xl p-4 text-sm text-slate-300">
            Non-custodial: <span className="text-white">{summary.nonCustodial}</span>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-lg font-medium text-white">Route inventory</p>
            <p className="text-sm text-slate-400">Wallets are created per payment and tracked with usage counts.</p>
          </div>
          <Badge>{wallets.length}</Badge>
        </div>
        <div className="mt-6 space-y-3">
          {wallets.map((wallet) => (
            <div key={wallet.id} className="glass-soft rounded-2xl p-4 text-sm text-slate-300">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base text-white">{wallet.asset}</span>
                    <Badge className="capitalize">{wallet.wallet_type.replace("_", " ")}</Badge>
                    <Badge className="border-white/10 bg-white/5 text-slate-200">{wallet.provider}</Badge>
                    {wallet.is_selected ? <Badge>Selected</Badge> : null}
                  </div>
                  <p className="text-xs text-slate-400">
                    {wallet.network} - {wallet.payment_count} payment{wallet.payment_count === 1 ? "" : "s"} -{" "}
                    {wallet.confirmed_count} confirmed
                  </p>
                  <p className="break-all font-mono text-xs text-slate-200">{wallet.address}</p>
                  <p className="text-xs text-slate-500">
                    Last seen: {wallet.last_seen_at ? new Date(wallet.last_seen_at).toLocaleString() : "Never"}
                  </p>
                  {wallet.payment_id ? <p className="text-xs text-slate-500">Payment: {wallet.payment_id}</p> : null}
                </div>
                <Button variant="ghost" onClick={() => copyAddress(wallet.address)}>
                  <Copy className="mr-2 h-4 w-4" />
                  {copied === wallet.address ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
