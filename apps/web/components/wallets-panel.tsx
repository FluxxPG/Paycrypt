"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, PlusCircle, QrCode, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
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
  is_manageable: boolean;
  last_seen_at: string | null;
  created_at: string;
  payment_count: number;
  confirmed_count: number;
};

type WalletCapabilityResponse = {
  data: WalletRow[];
  capabilities: {
    custodialEnabled: boolean;
    nonCustodialEnabled: boolean;
    planCode: string;
    priorityProcessing: boolean;
    nonCustodialWalletLimit: number;
    platformFeePercent: number;
  };
  custodialProvisioning: Array<{
    asset: string;
    network: string;
  }>;
};

type BinanceStatus = {
  connected: boolean;
  source: "merchant" | "platform";
  connectedAt: string | null;
  balances: Array<{ asset: string; free: string; locked: string }>;
  recentDeposits: Array<{ amount: string; coin: string; address?: string; txId?: string; status?: number }>;
  error?: string;
};

const nonCustodialNetworks = ["TRC20", "ERC20", "SOL"];

export const WalletsPanel = () => {
  const [wallets, setWallets] = useState<WalletRow[] | null>(null);
  const [capabilities, setCapabilities] = useState<WalletCapabilityResponse["capabilities"] | null>(null);
  const [custodialProvisioning, setCustodialProvisioning] = useState<
    WalletCapabilityResponse["custodialProvisioning"]
  >([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [binanceStatus, setBinanceStatus] = useState<BinanceStatus | null>(null);
  const [binanceForm, setBinanceForm] = useState({ apiKey: "", apiSecret: "" });
  const [custodialForm, setCustodialForm] = useState({ asset: "USDT", network: "TRC20" });
  const [nonCustodialForm, setNonCustodialForm] = useState({
    asset: "USDT",
    network: "TRC20",
    address: "",
    provider: "Trust Wallet"
  });
  const [verification, setVerification] = useState<{ id: string; message: string } | null>(null);
  const [signature, setSignature] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadWallets = async () => {
    const [payload, binance] = await Promise.all([
      apiFetch<WalletCapabilityResponse>("/dashboard/wallets"),
      apiFetch<BinanceStatus>("/dashboard/wallets/binance")
    ]);
    setWallets(payload.data);
    setCapabilities(payload.capabilities);
    setCustodialProvisioning(payload.custodialProvisioning);
    setBinanceStatus(binance);
  };

  useEffect(() => {
    let mounted = true;
    loadWallets()
      .catch((fetchError) => {
        if (!mounted) return;
        setWallets([]);
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load wallets");
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

  const existingManagedRouteKeys = useMemo(
    () =>
      new Set(
        (wallets ?? [])
          .filter((wallet) => wallet.wallet_type === "custodial" && wallet.is_manageable)
          .map((wallet) => `${wallet.asset}:${wallet.network}`)
      ),
    [wallets]
  );

  const availableNetworks = useMemo(
    () =>
      custodialProvisioning
        .filter((entry) => entry.asset === custodialForm.asset)
        .map((entry) => entry.network),
    [custodialForm.asset, custodialProvisioning]
  );

  const copyAddress = async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopied(address);
    window.setTimeout(() => setCopied(null), 1500);
  };

  const runWalletAction = async (key: string, action: () => Promise<void>) => {
    setBusyKey(key);
    setError(null);
    try {
      await action();
      await loadWallets();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Wallet action failed");
    } finally {
      setBusyKey(null);
    }
  };

  if (!wallets || !capabilities || !binanceStatus) {
    return <Card>Loading wallet control plane...</Card>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Active routes</p>
          <p className="mt-3 text-3xl text-white">{summary.active}</p>
          <p className="mt-2 text-sm text-slate-400">Reusable and payment-issued routes currently enabled.</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Primary routes</p>
          <p className="mt-3 text-3xl text-white">{summary.selected}</p>
          <p className="mt-2 text-sm text-slate-400">Default routes used when the merchant has multiple options.</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Custodial</p>
          <p className="mt-3 text-3xl text-white">{summary.custodial}</p>
          <p className="mt-2 text-sm text-slate-400">Managed by Binance and available for hosted checkout routing.</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Non-custodial</p>
          <p className="mt-3 text-3xl text-white">{summary.nonCustodial}</p>
          <p className="mt-2 text-sm text-slate-400">Merchant-owned routes available for approved chains.</p>
        </Card>
      </div>

      {error ? (
        <Card className="border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-medium text-white">Managed Binance routes</p>
                <p className="mt-1 text-sm text-slate-400">
                  Add supported currencies and networks to your merchant wallet inventory. Hosted checkout still renders
                  the QR dynamically for each payment intent.
                </p>
              </div>
              <Wallet className="h-5 w-5 text-cyan-300" />
            </div>
            <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-slate-300">
              <p>
                Binance account source:{" "}
                <span className="font-medium text-white">
                  {binanceStatus.source === "merchant" ? "Merchant API keys" : "Platform default keys"}
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {binanceStatus.connectedAt
                  ? `Connected at ${new Date(binanceStatus.connectedAt).toLocaleString()}`
                  : "No merchant Binance keys connected yet."}
              </p>
              {binanceStatus.error ? (
                <p className="mt-2 text-xs text-rose-300">Binance status warning: {binanceStatus.error}</p>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3">
              <input
                value={binanceForm.apiKey}
                onChange={(event) => setBinanceForm((prev) => ({ ...prev, apiKey: event.target.value }))}
                placeholder="Merchant Binance API Key"
                className="glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
              />
              <input
                type="password"
                value={binanceForm.apiSecret}
                onChange={(event) => setBinanceForm((prev) => ({ ...prev, apiSecret: event.target.value }))}
                placeholder="Merchant Binance API Secret"
                className="glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    runWalletAction("connect-binance", async () => {
                      await apiFetch("/dashboard/wallets/binance", {
                        method: "PUT",
                        body: JSON.stringify(binanceForm)
                      });
                      setBinanceForm({ apiKey: "", apiSecret: "" });
                    })
                  }
                  disabled={busyKey === "connect-binance" || !binanceForm.apiKey || !binanceForm.apiSecret}
                >
                  {busyKey === "connect-binance" ? "Connecting Binance..." : "Connect merchant Binance"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    runWalletAction("disconnect-binance", async () => {
                      await apiFetch("/dashboard/wallets/binance", { method: "DELETE" });
                    })
                  }
                  disabled={busyKey === "disconnect-binance" || binanceStatus.source !== "merchant"}
                >
                  {busyKey === "disconnect-binance" ? "Disconnecting..." : "Disconnect merchant Binance"}
                </Button>
              </div>
            </div>
            <div className="mt-6 grid gap-3">
              <select
                value={custodialForm.asset}
                onChange={(event) => {
                  const asset = event.target.value;
                  const nextNetwork =
                    custodialProvisioning.find((entry) => entry.asset === asset)?.network ?? custodialForm.network;
                  setCustodialForm({ asset, network: nextNetwork });
                }}
                className="glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
              >
                {Array.from(new Set(custodialProvisioning.map((entry) => entry.asset))).map((asset) => (
                  <option key={asset} value={asset} className="bg-slate-950">
                    {asset}
                  </option>
                ))}
              </select>
              <select
                value={custodialForm.network}
                onChange={(event) => setCustodialForm((prev) => ({ ...prev, network: event.target.value }))}
                className="glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
              >
                {availableNetworks.map((network) => (
                  <option key={network} value={network} className="bg-slate-950">
                    {network}
                  </option>
                ))}
              </select>
              <Button
                onClick={() =>
                  runWalletAction("provision-custodial", async () => {
                    await apiFetch("/dashboard/wallets/custodial", {
                      method: "POST",
                      body: JSON.stringify(custodialForm)
                    });
                  })
                }
                disabled={
                  !capabilities.custodialEnabled ||
                  busyKey === "provision-custodial" ||
                  existingManagedRouteKeys.has(`${custodialForm.asset}:${custodialForm.network}`)
                }
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                {!capabilities.custodialEnabled
                  ? "Custodial routing disabled"
                  : existingManagedRouteKeys.has(`${custodialForm.asset}:${custodialForm.network}`)
                  ? "Route already provisioned"
                  : busyKey === "provision-custodial"
                    ? "Provisioning..."
                    : "Add Binance route"}
              </Button>
            </div>
            <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-slate-300">
              API clients do not need to manually render this QR. They create a payment intent or payment link, and the
              hosted checkout generates the route-specific address and QR code for the payer.
            </div>
            {!capabilities.custodialEnabled ? (
              <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-50">
                Custodial routing is disabled for this merchant right now, so Binance route provisioning is locked.
              </div>
            ) : null}
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <p className="text-sm text-white">Live Binance balances</p>
                <div className="mt-3 space-y-2 text-xs text-slate-300">
                  {binanceStatus.balances.length ? (
                    binanceStatus.balances.slice(0, 6).map((balance) => (
                      <p key={balance.asset}>
                        {balance.asset}: free {Number(balance.free).toFixed(8)} | locked{" "}
                        {Number(balance.locked).toFixed(8)}
                      </p>
                    ))
                  ) : (
                    <p className="text-slate-500">No non-zero balances reported.</p>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <p className="text-sm text-white">Recent Binance deposits</p>
                <div className="mt-3 space-y-2 text-xs text-slate-300">
                  {binanceStatus.recentDeposits.length ? (
                    binanceStatus.recentDeposits.slice(0, 6).map((deposit, index) => (
                      <p key={`${deposit.txId ?? "tx"}-${index}`}>
                        {deposit.coin} {deposit.amount} {deposit.status === 1 ? "(success)" : "(pending)"}
                      </p>
                    ))
                  ) : (
                    <p className="text-slate-500">No recent deposits reported.</p>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {capabilities.nonCustodialEnabled ? (
            <Card className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-medium text-white">Non-custodial wallet onboarding</p>
                  <p className="mt-1 text-sm text-slate-400">
                    Add your own TRC20, ERC20, and Solana routes once admin entitlement is enabled for your plan.
                  </p>
                </div>
                <ShieldCheck className="h-5 w-5 text-emerald-300" />
              </div>
              <div className="mt-6 grid gap-3">
                <select
                  value={nonCustodialForm.asset}
                  onChange={(event) => setNonCustodialForm((prev) => ({ ...prev, asset: event.target.value }))}
                  className="glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
                >
                  {["USDT", "ETH"].map((asset) => (
                    <option key={asset} value={asset} className="bg-slate-950">
                      {asset}
                    </option>
                  ))}
                </select>
                <select
                  value={nonCustodialForm.network}
                  onChange={(event) => setNonCustodialForm((prev) => ({ ...prev, network: event.target.value }))}
                  className="glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
                >
                  {nonCustodialNetworks.map((network) => (
                    <option key={network} value={network} className="bg-slate-950">
                      {network}
                    </option>
                  ))}
                </select>
                <input
                  value={nonCustodialForm.provider}
                  onChange={(event) => setNonCustodialForm((prev) => ({ ...prev, provider: event.target.value }))}
                  placeholder="Wallet provider"
                  className="glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
                />
                <input
                  value={nonCustodialForm.address}
                  onChange={(event) => setNonCustodialForm((prev) => ({ ...prev, address: event.target.value }))}
                  placeholder="Wallet address"
                  className="glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
                />
                <Button
                  onClick={() =>
                    runWalletAction("non-custodial-verify", async () => {
                      const payload = await apiFetch<{ id: string; challenge_message: string }>(
                        "/dashboard/wallets/verify",
                        {
                          method: "POST",
                          body: JSON.stringify(nonCustodialForm)
                        }
                      );
                      setVerification({ id: payload.id, message: payload.challenge_message });
                      setNonCustodialForm((prev) => ({ ...prev, address: "" }));
                    })
                  }
                  disabled={busyKey === "non-custodial-verify" || !nonCustodialForm.address}
                >
                  {busyKey === "non-custodial-verify" ? "Creating challenge..." : "Add non-custodial wallet"}
                </Button>
              </div>
              {verification ? (
                <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-4 text-xs text-emerald-100">
                  <p className="font-medium text-emerald-50">Verification challenge</p>
                  <p className="mt-2 break-all font-mono text-emerald-200">{verification.message}</p>
                  <div className="mt-3 grid gap-2">
                    <input
                      value={signature}
                      onChange={(event) => setSignature(event.target.value)}
                      placeholder="Paste the wallet signature"
                      className="glass-soft w-full rounded-xl px-4 py-3 text-xs text-slate-100 outline-none"
                    />
                    <Button
                      onClick={() =>
                        runWalletAction("confirm-signature", async () => {
                          await apiFetch(`/dashboard/wallets/verify/${verification.id}/confirm`, {
                            method: "POST",
                            body: JSON.stringify({ signature })
                          });
                          setSignature("");
                          setVerification(null);
                        })
                      }
                      disabled={busyKey === "confirm-signature" || !signature}
                    >
                      {busyKey === "confirm-signature" ? "Verifying..." : "Verify signature"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </Card>
          ) : null}
        </div>

        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-medium text-white">Wallet inventory</p>
              <p className="mt-1 text-sm text-slate-400">
                Reusable merchant routes can be selected, paused, or removed. Payment-issued routes stay read-only for
                auditability.
              </p>
            </div>
            <Badge>{wallets.length}</Badge>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {wallets.map((wallet) => (
              <div key={wallet.id} className="glass-soft rounded-3xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg text-white">
                        {wallet.asset} {wallet.network}
                      </span>
                      <Badge className="capitalize">{wallet.wallet_type.replace("_", " ")}</Badge>
                      <Badge className="border-white/10 bg-white/5 text-slate-200">{wallet.provider}</Badge>
                      {wallet.is_selected ? <Badge>Primary</Badge> : null}
                      {!wallet.is_manageable ? (
                        <Badge className="border-white/10 bg-white/5 text-slate-300">Payment route</Badge>
                      ) : null}
                    </div>
                    <p className="mt-3 break-all font-mono text-xs text-slate-200">{wallet.address}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {wallet.confirmed_count}/{wallet.payment_count} confirmed payments
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Last seen: {wallet.last_seen_at ? new Date(wallet.last_seen_at).toLocaleString() : "Never"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-slate-950/50 p-3">
                    <QRCodeSVG value={wallet.address} size={92} bgColor="transparent" fgColor="#ffffff" />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="ghost" onClick={() => copyAddress(wallet.address)}>
                    <Copy className="mr-2 h-4 w-4" />
                    {copied === wallet.address ? "Copied" : "Copy"}
                  </Button>
                  {wallet.is_manageable ? (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          runWalletAction(`toggle-${wallet.id}`, async () => {
                            await apiFetch(`/dashboard/wallets/${wallet.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ isActive: !wallet.is_active })
                            });
                          })
                        }
                        disabled={busyKey === `toggle-${wallet.id}`}
                      >
                        {wallet.is_active ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        onClick={() =>
                          runWalletAction(`primary-${wallet.id}`, async () => {
                            await apiFetch(`/dashboard/wallets/${wallet.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ isSelected: true })
                            });
                          })
                        }
                        disabled={busyKey === `primary-${wallet.id}` || wallet.is_selected}
                      >
                        {wallet.is_selected ? "Primary" : "Set primary"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          runWalletAction(`delete-${wallet.id}`, async () => {
                            await apiFetch(`/dashboard/wallets/${wallet.id}`, {
                              method: "DELETE"
                            });
                          })
                        }
                        disabled={busyKey === `delete-${wallet.id}`}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove
                      </Button>
                    </>
                  ) : (
                    <div className="inline-flex items-center gap-2 rounded-xl border border-white/8 px-3 py-2 text-xs text-slate-400">
                      <QrCode className="h-4 w-4" />
                      Managed by payment lifecycle
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {wallets.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-400">
              No wallet routes yet. Provision a Binance route above or enable non-custodial wallets from admin first.
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
};
