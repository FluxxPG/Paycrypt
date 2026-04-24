"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { RealtimePayment } from "./realtime-payment";
import { apiFetch } from "../lib/authed-fetch";

type PaymentLedgerRow = {
  id: string;
  merchant_id: string;
  amount_fiat: number | string;
  quoted_amount_crypto: number | string;
  received_amount_crypto: number | string;
  fiat_currency: string;
  settlement_currency: string;
  network: string;
  customer_email: string | null;
  customer_name: string | null;
  description: string;
  payment_status: string;
  transaction_status: string;
  settlement_state: string;
  settlement_status: string | null;
  confirmations: number;
  tx_hash: string | null;
  wallet_address: string;
  wallet_provider: string;
  wallet_type: string;
  source_wallet_id: string | null;
  settlement_provider: string | null;
  settled_at: string | null;
  created_at: string;
  payment_method?: "crypto" | "upi";
  upi_provider?: string;
  upi_transaction_id?: string;
};

type FilterKey = "all" | "settled" | "unsettled" | "failed";

const formatTime = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      })
    : "Waiting";

const compactAddress = (value: string) => `${value.slice(0, 8)}...${value.slice(-6)}`;

const settlementTone = (state: string) => {
  switch (state) {
    case "settled":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
    case "processing":
      return "border-amber-400/20 bg-amber-400/10 text-amber-200";
    case "settlement_failed":
    case "not_settled":
    case "expired":
      return "border-rose-400/20 bg-rose-400/10 text-rose-200";
    default:
      return "border-cyan-400/20 bg-cyan-400/10 text-cyan-200";
  }
};

const walletTone = (walletType: string) =>
  walletType === "non_custodial"
    ? "border-violet-400/20 bg-violet-400/10 text-violet-200"
    : "border-sky-400/20 bg-sky-400/10 text-sky-200";

const isFailedRow = (row: PaymentLedgerRow) =>
  row.payment_status === "failed" ||
  row.payment_status === "expired" ||
  row.settlement_state === "settlement_failed" ||
  row.settlement_state === "not_settled" ||
  row.settlement_state === "expired";

const isUnsettledRow = (row: PaymentLedgerRow) =>
  !isFailedRow(row) && row.settlement_state !== "settled";

const copyValue = async (value: string | null) => {
  if (!value) return;
  await navigator.clipboard.writeText(value).catch(() => undefined);
};

export const DashboardPaymentsPanel = () => {
  const [rows, setRows] = useState<PaymentLedgerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [methodFilter, setMethodFilter] = useState<"all" | "crypto" | "upi">("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");

  useEffect(() => {
    let mounted = true;
    apiFetch<{ data: PaymentLedgerRow[] }>("/dashboard/payments")
      .then((payload) => mounted && setRows(payload.data))
      .catch((err) => mounted && setError(err instanceof Error ? err.message : "Failed to load payments"));
    return () => {
      mounted = false;
    };
  }, []);

  const summary = useMemo(() => {
    const payments = rows ?? [];
    return {
      total: payments.length,
      settled: payments.filter((row) => row.settlement_state === "settled").length,
      unsettled: payments.filter(isUnsettledRow).length,
      failed: payments.filter(isFailedRow).length,
      volume: payments.reduce((sum, row) => sum + Number(row.amount_fiat), 0),
      custodial: payments.filter((row) => row.wallet_type === "custodial").length,
      nonCustodial: payments.filter((row) => row.wallet_type === "non_custodial").length
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const payments = rows ?? [];
    let scoped = payments;
    if (filter === "settled") scoped = scoped.filter((row) => row.settlement_state === "settled");
    if (filter === "unsettled") scoped = scoped.filter(isUnsettledRow);
    if (filter === "failed") scoped = scoped.filter(isFailedRow);
    if (methodFilter !== "all") scoped = scoped.filter((row) => row.payment_method === methodFilter);
    if (providerFilter !== "all") scoped = scoped.filter((row) => (row.upi_provider ?? "crypto") === providerFilter);
    return scoped;
  }, [filter, methodFilter, providerFilter, rows]);

  const providerOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of rows ?? []) {
      if (row.payment_method === "upi" && row.upi_provider) {
        values.add(row.upi_provider);
      }
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  if (error) return <Card className="text-rose-300">{error}</Card>;
  if (!rows) return <Card>Loading unified payment ledger...</Card>;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-slate-400">Payments</p>
          <p className="mt-4 text-3xl font-semibold text-white">{summary.total}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Settled</p>
          <p className="mt-4 text-3xl font-semibold text-white">{summary.settled}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Unsettled</p>
          <p className="mt-4 text-3xl font-semibold text-white">{summary.unsettled}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Volume</p>
          <p className="mt-4 text-3xl font-semibold text-white">INR {summary.volume.toLocaleString("en-IN")}</p>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-lg font-medium text-white">Unified payment ledger</p>
              <p className="text-sm text-slate-400">
                Payment state, settlement state, wallet route, confirmations, and hash history in one workflow.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-300">
              <Badge className="border-sky-400/20 bg-sky-400/10 text-sky-200">Custodial {summary.custodial}</Badge>
              <Badge className="border-violet-400/20 bg-violet-400/10 text-violet-200">
                Non-custodial {summary.nonCustodial}
              </Badge>
              <Badge className="border-rose-400/20 bg-rose-400/10 text-rose-200">Attention {summary.failed}</Badge>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {([
              ["all", "All payments"],
              ["settled", "Settled"],
              ["unsettled", "Unsettled"],
              ["failed", "Needs attention"]
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full px-4 py-2 text-xs transition ${
                  filter === key ? "bg-cyan-400 text-slate-950" : "glass-soft text-slate-300"
                }`}
              >
                {label}
              </button>
            ))}
            <select
              value={methodFilter}
              onChange={(event) => setMethodFilter(event.target.value as "all" | "crypto" | "upi")}
              className="glass-soft rounded-full px-4 py-2 text-xs text-slate-200"
            >
              <option value="all">All methods</option>
              <option value="crypto">Crypto</option>
              <option value="upi">UPI</option>
            </select>
            <select
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value)}
              className="glass-soft rounded-full px-4 py-2 text-xs text-slate-200"
            >
              <option value="all">All providers</option>
              <option value="crypto">Crypto route</option>
              {providerOptions.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="border-b border-white/10 bg-white/5">
              <tr>
                <th className="px-6 py-4">Payment</th>
                <th className="px-6 py-4">Method</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Wallet source</th>
                <th className="px-6 py-4">On-chain</th>
                <th className="px-6 py-4">Settlement</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((payment) => (
                <tr key={payment.id} className="border-b border-white/5 align-top">
                  <td className="px-6 py-4">
                    <p className="font-medium text-white">{payment.id}</p>
                    <p className="mt-1 max-w-xs text-xs text-slate-400">{payment.description}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {payment.customer_name ?? payment.customer_email ?? "Direct checkout"} · {formatTime(payment.created_at)}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={
                      payment.payment_method === "upi" 
                        ? "bg-purple-400/20 text-purple-400 px-2 py-1 rounded-full text-xs"
                        : "bg-cyan-400/20 text-cyan-400 px-2 py-1 rounded-full text-xs"
                    }>
                      {payment.payment_method === "upi" ? "UPI" : "Crypto"}
                    </span>
                    {payment.payment_method === "upi" && payment.upi_provider && (
                      <p className="mt-1 text-xs text-slate-400 capitalize">{payment.upi_provider}</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-white">
                      INR {Number(payment.amount_fiat).toLocaleString("en-IN")}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {Number(payment.received_amount_crypto).toFixed(8)} {payment.settlement_currency}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">{payment.settlement_currency} / {payment.network}</p>
                  </td>
                  <td className="px-6 py-4">
                    <Badge className={`capitalize ${walletTone(payment.wallet_type)}`}>
                      {payment.wallet_type.replace("_", " ")}
                    </Badge>
                    <p className="mt-2 text-sm text-white">{payment.wallet_provider}</p>
                    <p className="mt-1 font-mono text-xs text-slate-400">{compactAddress(payment.wallet_address)}</p>
                  </td>
                  <td className="px-6 py-4">
                    <RealtimePayment
                      paymentId={payment.id}
                      merchantId={payment.merchant_id}
                      initialStatus={payment.payment_status}
                    />
                    <p className="mt-2 text-xs text-slate-400">{payment.confirmations} confirmations</p>
                    {payment.tx_hash ? (
                      <div className="mt-2 space-y-2">
                        <button
                          type="button"
                          onClick={() => void copyValue(payment.tx_hash)}
                          className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-200 transition hover:bg-cyan-400/20"
                        >
                          Copy hash
                        </button>
                        <p className="break-all font-mono text-xs text-slate-400">{payment.tx_hash}</p>
                      </div>
                    ) : (
                      <p className="mt-1 font-mono text-xs text-slate-500">Waiting for verified transaction hash</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <Badge className={`capitalize ${settlementTone(payment.settlement_state)}`}>
                      {payment.settlement_state.replaceAll("_", " ")}
                    </Badge>
                    <p className="mt-2 text-xs text-slate-400">
                      {payment.settlement_provider ?? payment.wallet_provider} · {formatTime(payment.settled_at)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {payment.settlement_state === "settled"
                        ? "Funds reconciled by worker pipeline"
                        : "Awaiting settlement completion"}
                    </p>
                  </td>
                </tr>
              ))}
              {!filteredRows.length ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-500">
                    No payments match this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
