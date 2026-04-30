"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Landmark, ReceiptText, WalletCards } from "lucide-react";
import { apiFetch } from "../lib/authed-fetch";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

type GroupedBalance = {
  asset: string;
  network: string;
  balances: {
    inbound: number;
    aggregation: number;
    cold_vault: number;
    withdrawable: number;
    pending: number;
  };
};

type TreasuryWithdrawal = {
  id: string;
  asset: string;
  network: string;
  amount_crypto: number | string;
  amount_fiat_equivalent: number | string;
  destination_address: string;
  destination_wallet_provider: string | null;
  final_amount_crypto: number | string;
  tx_hash: string | null;
  status: string;
  approved_at: string | null;
  processed_at: string | null;
  created_at: string;
};

type TreasuryFee = {
  fee_type: string;
  amount_crypto: number | string;
  amount_fiat: number | string;
};

type TreasuryTransaction = {
  id: string;
  asset: string;
  network: string;
  transaction_type: string;
  amount_crypto: number | string;
  from_balance_type: string | null;
  to_balance_type: string | null;
  status: string;
  created_at: string;
};

type WalletRow = {
  id: string;
  provider: string;
  asset: string;
  network: string;
  address: string;
  wallet_type: "custodial" | "non_custodial";
  is_active: boolean;
};

type TreasuryResponse = {
  data: {
    groupedBalances: GroupedBalance[];
    withdrawals: TreasuryWithdrawal[];
    transactions: TreasuryTransaction[];
    feeTotals: TreasuryFee[];
  };
};

type WalletResponse = {
  data: WalletRow[];
};

const formatDateTime = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      })
    : "Pending";

export const MerchantTreasuryPanel = () => {
  const [treasury, setTreasury] = useState<TreasuryResponse["data"] | null>(null);
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    asset: "USDT",
    network: "TRC20",
    amountCrypto: "",
    destinationAddress: "",
    destinationWalletProvider: ""
  });

  const load = async () => {
    const [treasuryPayload, walletPayload] = await Promise.all([
      apiFetch<TreasuryResponse>("/dashboard/treasury"),
      apiFetch<WalletResponse>("/dashboard/wallets")
    ]);
    setTreasury(treasuryPayload.data);
    setWallets(walletPayload.data.filter((wallet) => wallet.is_active));
  };

  useEffect(() => {
    void load().catch((loadError) =>
      setError(loadError instanceof Error ? loadError.message : "Failed to load treasury")
    );
  }, []);

  const groupedBalances = treasury?.groupedBalances ?? [];
  const withdrawableTotal = groupedBalances.reduce((sum, entry) => sum + Number(entry.balances.withdrawable ?? 0), 0);
  const pendingTotal = groupedBalances.reduce((sum, entry) => sum + Number(entry.balances.pending ?? 0), 0);
  const feeFiatTotal = (treasury?.feeTotals ?? []).reduce((sum, item) => sum + Number(item.amount_fiat ?? 0), 0);

  const withdrawableRoutes = useMemo(
    () => groupedBalances.filter((entry) => Number(entry.balances.withdrawable ?? 0) > 0),
    [groupedBalances]
  );

  const walletOptions = useMemo(
    () =>
      wallets.filter((wallet) => wallet.asset === form.asset && wallet.network === form.network && wallet.is_active),
    [wallets, form.asset, form.network]
  );

  useEffect(() => {
    if (!walletOptions.length) {
      setForm((current) => ({ ...current, destinationAddress: "", destinationWalletProvider: "" }));
      return;
    }
    if (!walletOptions.some((wallet) => wallet.address === form.destinationAddress)) {
      const first = walletOptions[0];
      setForm((current) => ({
        ...current,
        destinationAddress: first.address,
        destinationWalletProvider: first.provider
      }));
    }
  }, [walletOptions, form.destinationAddress]);

  const submitWithdrawal = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/dashboard/treasury/withdrawals", {
        method: "POST",
        body: JSON.stringify({
          asset: form.asset,
          network: form.network,
          amountCrypto: Number(form.amountCrypto),
          destinationAddress: form.destinationAddress,
          destinationWalletProvider: form.destinationWalletProvider
        })
      });
      setForm((current) => ({ ...current, amountCrypto: "" }));
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to request withdrawal");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {error ? (
        <Card className="border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Withdrawable</p>
          <p className="mt-3 text-3xl text-white">{withdrawableTotal.toFixed(6)}</p>
          <p className="mt-2 text-sm text-slate-400">Available across all merchant treasury lanes.</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Pending settlement</p>
          <p className="mt-3 text-3xl text-white">{pendingTotal.toFixed(6)}</p>
          <p className="mt-2 text-sm text-slate-400">Funds waiting to clear into withdrawable balance.</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Fee deductions</p>
          <p className="mt-3 text-3xl text-white">INR {feeFiatTotal.toLocaleString("en-IN")}</p>
          <p className="mt-2 text-sm text-slate-400">Platform fees already booked through the ledger.</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Withdrawals</p>
          <p className="mt-3 text-3xl text-white">{treasury?.withdrawals.length ?? 0}</p>
          <p className="mt-2 text-sm text-slate-400">Recent withdrawal requests and treasury outflows.</p>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-medium text-white">Treasury balances</p>
              <p className="mt-1 text-sm text-slate-400">
                Gross route balances, pending credits, and withdrawable merchant amounts are tracked separately.
              </p>
            </div>
            <Landmark className="h-5 w-5 text-cyan-300" />
          </div>
          <div className="mt-6 space-y-4">
            {groupedBalances.length ? (
              groupedBalances.map((entry) => (
                <div key={`${entry.asset}-${entry.network}`} className="glass-soft rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-white">
                        {entry.asset} / {entry.network}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Current treasury layer balances for this route.</p>
                    </div>
                    <Badge>{entry.balances.withdrawable.toFixed(6)} ready</Badge>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    {[
                      ["Pending", entry.balances.pending],
                      ["Withdrawable", entry.balances.withdrawable],
                      ["Inbound", entry.balances.inbound],
                      ["Aggregation", entry.balances.aggregation]
                    ].map(([label, amount]) => (
                      <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
                        <p className="mt-2 text-lg text-white">{Number(amount).toFixed(6)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-slate-400">
                Treasury balances will appear once confirmed payments are reconciled into the merchant ledger.
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-medium text-white">Request withdrawal</p>
              <p className="mt-1 text-sm text-slate-400">
                Withdraw only to active connected routes for the same asset and network. Small withdrawals include the configured gas protection fee.
              </p>
            </div>
            <ArrowUpRight className="h-5 w-5 text-cyan-300" />
          </div>
          <div className="mt-6 grid gap-3">
            <select
              value={`${form.asset}:${form.network}`}
              onChange={(event) => {
                const [asset, network] = event.target.value.split(":");
                setForm((current) => ({
                  ...current,
                  asset,
                  network,
                  destinationAddress: "",
                  destinationWalletProvider: ""
                }));
              }}
              className="glass-soft rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
            >
              {withdrawableRoutes.length ? (
                withdrawableRoutes.map((entry) => (
                  <option key={`${entry.asset}:${entry.network}`} value={`${entry.asset}:${entry.network}`} className="bg-slate-950">
                    {entry.asset} / {entry.network}
                  </option>
                ))
              ) : (
                <option value="USDT:TRC20" className="bg-slate-950">
                  No withdrawable routes yet
                </option>
              )}
            </select>
            <input
              value={form.amountCrypto}
              onChange={(event) => setForm((current) => ({ ...current, amountCrypto: event.target.value }))}
              placeholder="Amount in crypto"
              className="glass-soft rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
            />
            <select
              value={form.destinationAddress}
              onChange={(event) => {
                const selected = walletOptions.find((wallet) => wallet.address === event.target.value);
                setForm((current) => ({
                  ...current,
                  destinationAddress: event.target.value,
                  destinationWalletProvider: selected?.provider ?? ""
                }));
              }}
              className="glass-soft rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
            >
              {walletOptions.length ? (
                walletOptions.map((wallet) => (
                  <option key={wallet.id} value={wallet.address} className="bg-slate-950">
                    {wallet.provider} - {wallet.address.slice(0, 8)}...{wallet.address.slice(-8)}
                  </option>
                ))
              ) : (
                <option value="" className="bg-slate-950">
                  No eligible connected destination wallets
                </option>
              )}
            </select>
            <Button
              onClick={submitWithdrawal}
              disabled={
                submitting ||
                !withdrawableRoutes.length ||
                !form.destinationAddress ||
                !Number.isFinite(Number(form.amountCrypto)) ||
                Number(form.amountCrypto) <= 0
              }
            >
              {submitting ? "Submitting withdrawal..." : "Create withdrawal request"}
            </Button>
          </div>
          <div className="mt-6 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <p className="text-sm text-white">Fee summary</p>
            <div className="mt-3 space-y-2 text-xs text-slate-300">
              {(treasury?.feeTotals ?? []).length ? (
                treasury!.feeTotals.map((fee) => (
                  <p key={fee.fee_type}>
                    {fee.fee_type}: {Number(fee.amount_crypto).toFixed(6)} / INR{" "}
                    {Number(fee.amount_fiat).toLocaleString("en-IN")}
                  </p>
                ))
              ) : (
                <p className="text-slate-500">No fee events recorded yet.</p>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-white">Recent withdrawals</p>
              <p className="text-sm text-slate-400">Approval and execution status for merchant treasury outflows.</p>
            </div>
            <WalletCards className="h-5 w-5 text-cyan-300" />
          </div>
          <div className="mt-6 space-y-3">
            {(treasury?.withdrawals ?? []).length ? (
              treasury!.withdrawals.map((withdrawal) => (
                <div key={withdrawal.id} className="glass-soft rounded-2xl p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm text-white">{withdrawal.asset} / {withdrawal.network}</p>
                        <Badge className="capitalize">{withdrawal.status}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Requested {Number(withdrawal.amount_crypto).toFixed(6)} and net {Number(withdrawal.final_amount_crypto).toFixed(6)}
                      </p>
                      <p className="mt-1 break-all text-xs text-slate-400">{withdrawal.destination_address}</p>
                    </div>
                    <div className="text-xs text-slate-400 lg:text-right">
                      <p>Created: {formatDateTime(withdrawal.created_at)}</p>
                      <p>Approved: {formatDateTime(withdrawal.approved_at)}</p>
                      <p>Processed: {formatDateTime(withdrawal.processed_at)}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-slate-400">
                No withdrawal requests recorded yet.
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-white">Ledger activity</p>
              <p className="text-sm text-slate-400">Treasury movements credited from payments, fees, and withdrawals.</p>
            </div>
            <ReceiptText className="h-5 w-5 text-cyan-300" />
          </div>
          <div className="mt-6 space-y-3">
            {(treasury?.transactions ?? []).slice(0, 12).map((entry) => (
              <div key={entry.id} className="glass-soft rounded-2xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm capitalize text-white">{entry.transaction_type.replaceAll("_", " ")}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {entry.asset} / {entry.network} - {Number(entry.amount_crypto).toFixed(6)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {entry.from_balance_type ?? "source"} to {entry.to_balance_type ?? "destination"}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge className="capitalize">{entry.status}</Badge>
                    <p className="mt-2 text-xs text-slate-400">{formatDateTime(entry.created_at)}</p>
                  </div>
                </div>
              </div>
            ))}
            {!treasury?.transactions.length ? (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-slate-400">
                Treasury ledger entries will appear as soon as payments settle or withdrawals execute.
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
};
