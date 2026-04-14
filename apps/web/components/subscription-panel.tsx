"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { apiFetch } from "../lib/authed-fetch";

type InvoiceRow = {
  id: string;
  invoice_number: string;
  plan_code: "starter" | "business" | "premium" | "custom";
  status: "issued" | "paid" | "overdue" | "void" | string;
  billing_period_start: string;
  billing_period_end: string;
  currency: string;
  subtotal_inr: number | string;
  tax_inr: number | string;
  total_inr: number | string;
  paid_amount_inr: number | string;
  due_at: string;
  paid_at: string | null;
  created_at: string;
};

type SubscriptionSummary = {
  subscription?: {
    plan_code: "starter" | "business" | "premium" | "custom";
    status: string;
    monthly_price_inr: number | string;
    transaction_limit: number;
    setup_fee_inr: number | string;
    metadata: Record<string, unknown>;
  };
  usage: Array<{ event_type: string; total: number }>;
  billing: {
    invoiceCount: number;
    totalInvoiced: number;
    paid: number;
    outstanding: number;
    overdue: number;
    currency: string;
  };
  invoices: InvoiceRow[];
};

const plans = [
  {
    code: "starter",
    title: "Starter",
    price: "INR 10,000",
    limit: "5,000 tx",
    note: "Custodial only"
  },
  {
    code: "business",
    title: "Business",
    price: "INR 15,000",
    limit: "20,000 tx",
    note: "Priority processing"
  },
  {
    code: "premium",
    title: "Premium",
    price: "INR 35,000",
    limit: "100,000 tx",
    note: "Non-custodial eligible"
  },
  {
    code: "custom",
    title: "Custom",
    price: "POA",
    limit: "Unlimited",
    note: "Pay-as-you-go"
  }
] as const;

const invoiceBadgeClass = (status: string) => {
  switch (status) {
    case "paid":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
    case "overdue":
      return "border-rose-400/20 bg-rose-400/10 text-rose-200";
    case "void":
      return "border-slate-400/20 bg-slate-400/10 text-slate-200";
    default:
      return "border-cyan-400/20 bg-cyan-400/10 text-cyan-200";
  }
};

const formatPeriod = (start: string, end: string) => {
  const startLabel = new Date(start).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const endLabel = new Date(end).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return `${startLabel} - ${endLabel}`;
};

export const SubscriptionPanel = () => {
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const payload = await apiFetch<SubscriptionSummary>("/dashboard/subscriptions");
    setSummary(payload);
  };

  useEffect(() => {
    void load();
  }, []);

  const currentPlan = summary?.subscription?.plan_code ?? "starter";
  const used = summary?.usage.reduce((sum, item) => sum + Number(item.total), 0) ?? 0;
  const limit = Number(summary?.subscription?.transaction_limit ?? 0);
  const billing = summary?.billing ?? {
    invoiceCount: 0,
    totalInvoiced: 0,
    paid: 0,
    outstanding: 0,
    overdue: 0,
    currency: "INR"
  };
  const remaining = useMemo(() => {
    if (!limit) return "Unlimited";
    return `${Math.max(0, limit - used).toLocaleString("en-IN")} remaining`;
  }, [limit, used]);

  const changePlan = async (planCode: "starter" | "business" | "premium" | "custom") => {
    setLoading(true);
    try {
      await apiFetch("/dashboard/subscriptions/plan", {
        method: "POST",
        body: JSON.stringify({ planCode })
      });
      await load();
    } finally {
      setLoading(false);
    }
  };

  if (!summary) return <Card>Loading billing summary...</Card>;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-slate-400">Current plan</p>
          <p className="mt-4 text-3xl font-semibold capitalize text-white">{currentPlan}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Usage</p>
          <p className="mt-4 text-3xl font-semibold text-white">{used.toLocaleString("en-IN")}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Invoiced</p>
          <p className="mt-4 text-3xl font-semibold text-white">
            INR {billing.totalInvoiced.toLocaleString("en-IN")}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Outstanding</p>
          <p className="mt-4 text-3xl font-semibold text-white">
            INR {billing.outstanding.toLocaleString("en-IN")}
          </p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-white">Current billing</p>
              <p className="text-sm text-slate-400">Usage, entitlements, and invoice posture for the active merchant.</p>
            </div>
            <Badge className="capitalize">{currentPlan}</Badge>
          </div>
          <div className="mt-6 space-y-3 text-sm text-slate-300">
            <div className="glass-soft rounded-2xl p-4">Status: {summary.subscription?.status ?? "inactive"}</div>
            <div className="glass-soft rounded-2xl p-4">
              Monthly usage: {used.toLocaleString("en-IN")} / {limit ? limit.toLocaleString("en-IN") : "Unlimited"}
            </div>
            <div className="glass-soft rounded-2xl p-4">{remaining}</div>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="glass-soft rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Invoices</p>
              <p className="mt-2 text-2xl font-semibold text-white">{billing.invoiceCount}</p>
            </div>
            <div className="glass-soft rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Paid</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                INR {billing.paid.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="glass-soft rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Overdue</p>
              <p className="mt-2 text-2xl font-semibold text-white">{billing.overdue}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-white">Plans</p>
              <p className="text-sm text-slate-400">Switch plans or request custom pricing.</p>
            </div>
            <Badge>Live</Badge>
          </div>
          <div className="mt-6 grid gap-3">
            {plans.map((plan) => (
              <div key={plan.code} className="glass-soft rounded-2xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-white">{plan.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {plan.price} - {plan.limit} - {plan.note}
                    </p>
                  </div>
                  <Button
                    variant={currentPlan === plan.code ? "secondary" : "default"}
                    disabled={loading || currentPlan === plan.code || plan.code === "custom"}
                    onClick={() => changePlan(plan.code)}
                  >
                    {currentPlan === plan.code ? "Active" : plan.code === "custom" ? "Admin only" : "Switch"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-lg font-medium text-white">Invoice history</p>
            <p className="text-sm text-slate-400">Subscription and billing change ledger with payment posture.</p>
          </div>
          <Badge>{billing.invoiceCount} invoices</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="border-b border-white/10 bg-white/5">
              <tr>
                <th className="px-6 py-4">Invoice</th>
                <th className="px-6 py-4">Period</th>
                <th className="px-6 py-4">Plan</th>
                <th className="px-6 py-4">Total</th>
                <th className="px-6 py-4">Due</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {summary.invoices.length ? (
                summary.invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-white/5">
                    <td className="px-6 py-4 text-white">{invoice.invoice_number}</td>
                    <td className="px-6 py-4">{formatPeriod(invoice.billing_period_start, invoice.billing_period_end)}</td>
                    <td className="px-6 py-4 capitalize">{invoice.plan_code}</td>
                    <td className="px-6 py-4">INR {Number(invoice.total_inr).toLocaleString("en-IN")}</td>
                    <td className="px-6 py-4">{new Date(invoice.due_at).toLocaleDateString("en-IN")}</td>
                    <td className="px-6 py-4">
                      <Badge className={invoiceBadgeClass(invoice.status)}>{invoice.status}</Badge>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-6 py-6 text-slate-400" colSpan={6}>
                    No invoices recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
