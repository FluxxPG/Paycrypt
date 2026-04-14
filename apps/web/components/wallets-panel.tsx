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
  const [form, setForm] = useState({ asset: "USDT", network: "TRC20", address: "", provider: "trust" });
  const [verification, setVerification] = useState<{ id: string; message: string } | null>(null);
  const [signature, setSignature] = useState("");
  const [saving, setSaving] = useState(false);

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
        <div className="mt-6 border-t border-white/5 pt-6">
          <p className="text-sm font-medium text-white">Register non-custodial wallet</p>
          <p className="mt-1 text-xs text-slate-400">
            Requires admin approval. Use TRC20, ERC20, or SOL addresses.
          </p>
          <div className="mt-4 grid gap-3">
            <select
              value={form.asset}
              onChange={(event) => setForm((prev) => ({ ...prev, asset: event.target.value }))}
              className="glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
            >
              {["USDT", "ETH"].map((asset) => (
                <option key={asset} value={asset} className="bg-slate-900">
                  {asset}
                </option>
              ))}
            </select>
            <select
              value={form.network}
              onChange={(event) => setForm((prev) => ({ ...prev, network: event.target.value }))}
              className="glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
            >
              {["TRC20", "ERC20", "SOL"].map((network) => (
                <option key={network} value={network} className="bg-slate-900">
                  {network}
                </option>
              ))}
            </select>
            <input
              value={form.provider}
              onChange={(event) => setForm((prev) => ({ ...prev, provider: event.target.value }))}
              placeholder="Wallet provider (e.g. Trust Wallet)"
              className="glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
            />
            <input
              value={form.address}
              onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
              placeholder="Wallet address"
              className="glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
            />
            <Button
              onClick={async () => {
                if (!form.address) return;
                setSaving(true);
                try {
                  const payload = await apiFetch<{ id: string; challenge_message: string }>("/dashboard/wallets/verify", {
                    method: "POST",
                    body: JSON.stringify(form)
                  });
                  setVerification({ id: payload.id, message: payload.challenge_message });
                  setForm((prev) => ({ ...prev, address: "" }));
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
            >
              {saving ? "Saving..." : "Add wallet"}
            </Button>
          </div>
          {verification ? (
            <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100">
              Sign this message in your wallet and send it to support:
              <div className="mt-2 break-all font-mono text-emerald-200">{verification.message}</div>
              <div className="mt-3 grid gap-2">
                <input
                  value={signature}
                  onChange={(event) => setSignature(event.target.value)}
                  placeholder="Paste signature"
                  className="glass-soft w-full rounded-xl px-4 py-3 text-xs text-slate-100 outline-none"
                />
                <Button
                  onClick={async () => {
                    if (!verification || !signature) return;
                    await apiFetch(`/dashboard/wallets/verify/${verification.id}/confirm`, {
                      method: "POST",
                      body: JSON.stringify({ signature })
                    });
                    setSignature("");
                    setVerification(null);
                  }}
                >
                  Verify signature
                </Button>
              </div>
            </div>
          ) : null}
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
