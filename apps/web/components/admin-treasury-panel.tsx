"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Shield, WalletCards } from "lucide-react";
import { apiFetch } from "../lib/authed-fetch";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

type TreasuryBalance = {
  id: string;
  asset: string;
  network: string;
  balance_type: string;
  amount_crypto: number | string;
};

type TreasuryFee = {
  fee_type: string;
  total_crypto: number | string;
  total_fiat: number | string;
};

type TreasuryWithdrawal = {
  id: string;
  owner_type: string;
  owner_id: string;
  asset: string;
  network: string;
  amount_crypto: number | string;
  final_amount_crypto: number | string;
  destination_address: string;
  status: string;
  approved_at: string | null;
  created_at: string;
};

type TreasuryAdjustment = {
  id: string;
  owner_type: string;
  owner_id: string;
  asset: string;
  network: string;
  adjustment_type: string;
  amount_crypto: number | string;
  amount_fiat_equivalent: number | string;
  reason: string;
  status: string;
};

type PlatformWallet = {
  id: string;
  wallet_type: string;
  asset: string;
  network: string;
  wallet_address: string;
  provider: string;
  is_active: boolean;
  is_default: boolean;
};

type MerchantRow = {
  id: string;
  name: string;
};

type TreasuryResponse = {
  data: {
    balances: TreasuryBalance[];
    totalFees: TreasuryFee[];
    pendingWithdrawals: TreasuryWithdrawal[];
    platformWallets: PlatformWallet[];
  };
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

export const AdminTreasuryPanel = () => {
  const [treasury, setTreasury] = useState<TreasuryResponse["data"] | null>(null);
  const [withdrawals, setWithdrawals] = useState<TreasuryWithdrawal[]>([]);
  const [adjustments, setAdjustments] = useState<TreasuryAdjustment[]>([]);
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [adjustmentForm, setAdjustmentForm] = useState({
    ownerType: "platform",
    ownerId: "platform",
    asset: "USDT",
    network: "TRC20",
    adjustmentType: "credit",
    amountCrypto: "",
    amountFiatEquivalent: "",
    reason: ""
  });

  const load = async () => {
    const [treasuryPayload, withdrawalsPayload, adjustmentsPayload, merchantsPayload] = await Promise.all([
      apiFetch<TreasuryResponse>("/admin/treasury"),
      apiFetch<{ data: TreasuryWithdrawal[] }>("/admin/treasury/withdrawals"),
      apiFetch<{ data: TreasuryAdjustment[] }>("/admin/treasury/adjustments"),
      apiFetch<{ data: MerchantRow[] }>("/admin/merchants")
    ]);
    setTreasury(treasuryPayload.data);
    setWithdrawals(withdrawalsPayload.data);
    setAdjustments(adjustmentsPayload.data);
    setMerchants(merchantsPayload.data);
  };

  useEffect(() => {
    void load().catch((loadError) =>
      setError(loadError instanceof Error ? loadError.message : "Failed to load treasury")
    );
  }, []);

  const totalPlatformCrypto = useMemo(
    () => (treasury?.balances ?? []).reduce((sum, row) => sum + Number(row.amount_crypto ?? 0), 0),
    [treasury]
  );
  const totalFeeFiat = useMemo(
    () => (treasury?.totalFees ?? []).reduce((sum, row) => sum + Number(row.total_fiat ?? 0), 0),
    [treasury]
  );

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusyKey(key);
    setError(null);
    try {
      await action();
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Treasury action failed");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-6">
      {error ? (
        <Card className="border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Platform balances</p>
          <p className="mt-3 text-3xl text-white">{totalPlatformCrypto.toFixed(6)}</p>
          <p className="mt-2 text-sm text-slate-400">Total recorded treasury inventory across platform layers.</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Fee revenue</p>
          <p className="mt-3 text-3xl text-white">INR {totalFeeFiat.toLocaleString("en-IN")}</p>
          <p className="mt-2 text-sm text-slate-400">Ledger-booked revenue from platform treasury fees.</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Pending withdrawals</p>
          <p className="mt-3 text-3xl text-white">{withdrawals.filter((row) => row.status === "pending").length}</p>
          <p className="mt-2 text-sm text-slate-400">Requests requiring admin approval or execution.</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Open adjustments</p>
          <p className="mt-3 text-3xl text-white">{adjustments.filter((row) => row.status === "pending").length}</p>
          <p className="mt-2 text-sm text-slate-400">Manual treasury corrections awaiting approval.</p>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-medium text-white">Platform wallet layers</p>
              <p className="mt-1 text-sm text-slate-400">
                Inbound, aggregation, and cold-vault routes registered for platform custody.
              </p>
            </div>
            <WalletCards className="h-5 w-5 text-cyan-300" />
          </div>
          <div className="mt-6 space-y-3">
            {(treasury?.platformWallets ?? []).map((wallet) => (
              <div key={wallet.id} className="glass-soft rounded-2xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-white">
                      {wallet.wallet_type.replaceAll("_", " ")} - {wallet.asset} / {wallet.network}
                    </p>
                    <p className="mt-1 break-all text-xs text-slate-500">{wallet.wallet_address}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge>{wallet.provider}</Badge>
                    <span className="text-xs text-slate-400">
                      {wallet.is_default ? "default" : "secondary"} - {wallet.is_active ? "active" : "inactive"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 space-y-3">
            {(treasury?.balances ?? []).map((balance) => (
              <div key={balance.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-white">
                      {balance.asset} / {balance.network}
                    </p>
                    <p className="mt-1 text-xs capitalize text-slate-500">{balance.balance_type.replaceAll("_", " ")}</p>
                  </div>
                  <p className="text-sm text-slate-200">{Number(balance.amount_crypto).toFixed(6)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-medium text-white">Treasury adjustments</p>
              <p className="mt-1 text-sm text-slate-400">Create or approve ledger corrections without mutating on-chain history.</p>
            </div>
            <Shield className="h-5 w-5 text-cyan-300" />
          </div>
          <div className="mt-6 grid gap-3">
            <select
              value={adjustmentForm.ownerType}
              onChange={(event) =>
                setAdjustmentForm((current) => ({
                  ...current,
                  ownerType: event.target.value,
                  ownerId: event.target.value === "platform" ? "platform" : merchants[0]?.id ?? ""
                }))
              }
              className="glass-soft rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
            >
              <option value="platform" className="bg-slate-950">Platform</option>
              <option value="merchant" className="bg-slate-950">Merchant</option>
            </select>
            {adjustmentForm.ownerType === "merchant" ? (
              <select
                value={adjustmentForm.ownerId}
                onChange={(event) => setAdjustmentForm((current) => ({ ...current, ownerId: event.target.value }))}
                className="glass-soft rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
              >
                {merchants.map((merchant) => (
                  <option key={merchant.id} value={merchant.id} className="bg-slate-950">
                    {merchant.name} ({merchant.id})
                  </option>
                ))}
              </select>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={adjustmentForm.asset}
                onChange={(event) => setAdjustmentForm((current) => ({ ...current, asset: event.target.value.toUpperCase() }))}
                placeholder="Asset"
                className="glass-soft rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
              />
              <input
                value={adjustmentForm.network}
                onChange={(event) => setAdjustmentForm((current) => ({ ...current, network: event.target.value.toUpperCase() }))}
                placeholder="Network"
                className="glass-soft rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <select
                value={adjustmentForm.adjustmentType}
                onChange={(event) => setAdjustmentForm((current) => ({ ...current, adjustmentType: event.target.value }))}
                className="glass-soft rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
              >
                <option value="credit" className="bg-slate-950">Credit</option>
                <option value="debit" className="bg-slate-950">Debit</option>
              </select>
              <input
                value={adjustmentForm.amountCrypto}
                onChange={(event) => setAdjustmentForm((current) => ({ ...current, amountCrypto: event.target.value }))}
                placeholder="Amount crypto"
                className="glass-soft rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
              />
              <input
                value={adjustmentForm.amountFiatEquivalent}
                onChange={(event) => setAdjustmentForm((current) => ({ ...current, amountFiatEquivalent: event.target.value }))}
                placeholder="Amount fiat"
                className="glass-soft rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
              />
            </div>
            <input
              value={adjustmentForm.reason}
              onChange={(event) => setAdjustmentForm((current) => ({ ...current, reason: event.target.value }))}
              placeholder="Reason for adjustment"
              className="glass-soft rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
            />
            <Button
              onClick={() =>
                runAction("create-adjustment", async () => {
                  await apiFetch("/admin/treasury/adjustments", {
                    method: "POST",
                    body: JSON.stringify({
                      ownerType: adjustmentForm.ownerType,
                      ownerId: adjustmentForm.ownerId,
                      asset: adjustmentForm.asset,
                      network: adjustmentForm.network,
                      adjustmentType: adjustmentForm.adjustmentType,
                      amountCrypto: Number(adjustmentForm.amountCrypto),
                      amountFiatEquivalent: Number(adjustmentForm.amountFiatEquivalent),
                      reason: adjustmentForm.reason
                    })
                  });
                  setAdjustmentForm((current) => ({
                    ...current,
                    amountCrypto: "",
                    amountFiatEquivalent: "",
                    reason: ""
                  }));
                })
              }
              disabled={
                busyKey === "create-adjustment" ||
                !adjustmentForm.ownerId ||
                !adjustmentForm.reason.trim() ||
                !Number.isFinite(Number(adjustmentForm.amountCrypto)) ||
                !Number.isFinite(Number(adjustmentForm.amountFiatEquivalent))
              }
            >
              {busyKey === "create-adjustment" ? "Creating adjustment..." : "Create adjustment"}
            </Button>
          </div>

          <div className="mt-6 space-y-3">
            {adjustments.slice(0, 12).map((adjustment) => (
              <div key={adjustment.id} className="glass-soft rounded-2xl p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm capitalize text-white">
                      {adjustment.adjustment_type} - {adjustment.asset} / {adjustment.network}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {adjustment.owner_type}:{adjustment.owner_id} - {adjustment.reason}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="capitalize">{adjustment.status}</Badge>
                    {adjustment.status === "pending" ? (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          runAction(`approve-adjustment-${adjustment.id}`, async () => {
                            await apiFetch(`/admin/treasury/adjustments/${adjustment.id}/approve`, {
                              method: "POST"
                            });
                          })
                        }
                        disabled={busyKey === `approve-adjustment-${adjustment.id}`}
                      >
                        Approve
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-medium text-white">Withdrawal approvals</p>
            <p className="text-sm text-slate-400">Review and process queued treasury outflows.</p>
          </div>
          <AlertTriangle className="h-5 w-5 text-cyan-300" />
        </div>
        <div className="mt-6 space-y-3">
          {withdrawals.length ? (
            withdrawals.map((withdrawal) => (
              <div key={withdrawal.id} className="glass-soft rounded-2xl p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm text-white">
                        {withdrawal.owner_type}:{withdrawal.owner_id}
                      </p>
                      <Badge className="capitalize">{withdrawal.status}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {withdrawal.asset} / {withdrawal.network} - request {Number(withdrawal.amount_crypto).toFixed(6)} - net{" "}
                      {Number(withdrawal.final_amount_crypto).toFixed(6)}
                    </p>
                    <p className="mt-1 break-all text-xs text-slate-400">{withdrawal.destination_address}</p>
                    <p className="mt-1 text-xs text-slate-500">Created {formatDateTime(withdrawal.created_at)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {withdrawal.status === "pending" ? (
                      <>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            runAction(`approve-withdrawal-${withdrawal.id}`, async () => {
                              await apiFetch(`/admin/treasury/withdrawals/${withdrawal.id}/approve`, {
                                method: "POST"
                              });
                            })
                          }
                          disabled={busyKey === `approve-withdrawal-${withdrawal.id}`}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            runAction(`reject-withdrawal-${withdrawal.id}`, async () => {
                              await apiFetch(`/admin/treasury/withdrawals/${withdrawal.id}/reject`, {
                                method: "POST",
                                body: JSON.stringify({ rejectionReason: "Rejected by admin" })
                              });
                            })
                          }
                          disabled={busyKey === `reject-withdrawal-${withdrawal.id}`}
                        >
                          Reject
                        </Button>
                      </>
                    ) : null}
                    {(withdrawal.status === "pending" || withdrawal.status === "processing") && withdrawal.approved_at ? (
                      <Button
                        onClick={() =>
                          runAction(`process-withdrawal-${withdrawal.id}`, async () => {
                            await apiFetch(`/admin/treasury/withdrawals/${withdrawal.id}/process`, {
                              method: "POST"
                            });
                          })
                        }
                        disabled={busyKey === `process-withdrawal-${withdrawal.id}`}
                      >
                        Process
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-slate-400">
              No platform withdrawal requests are currently waiting for approval.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
