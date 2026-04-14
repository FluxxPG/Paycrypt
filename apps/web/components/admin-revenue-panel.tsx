"use client";

import { useEffect, useState } from "react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { apiFetch } from "../lib/authed-fetch";

type Subscription = {
  id: string;
  merchant_id: string;
  merchant_name: string;
  merchant_email: string;
  plan_code: string;
  status: string;
  monthly_price_inr: string;
  transaction_limit: number;
  updated_at: string;
};

type Invoice = {
  id: string;
  invoice_number: string;
  merchant_name: string;
  plan_code: string;
  status: string;
  total_inr: string;
  paid_amount_inr: string;
  due_at: string;
  created_at: string;
};

type RevenueSummary = {
  mrr: number;
  activeSubscriptions: number;
  invoiceTotals: {
    total: number;
    paid: number;
    outstanding: number;
    overdue: number;
  };
};

export const AdminRevenuePanel = () => {
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      apiFetch<RevenueSummary>("/admin/revenue"),
      apiFetch<{ data: Subscription[] }>("/admin/subscriptions"),
      apiFetch<{ data: Invoice[] }>("/admin/invoices")
    ]).then(([summaryPayload, subscriptionsPayload, invoicesPayload]) => {
      if (!mounted) return;
      setSummary(summaryPayload);
      setSubscriptions(subscriptionsPayload.data);
      setInvoices(invoicesPayload.data);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!summary) {
    return <Card>Loading revenue analytics...</Card>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <p className="text-sm text-slate-400">Monthly recurring</p>
          <p className="mt-4 text-3xl font-semibold text-white">INR {summary.mrr.toLocaleString("en-IN")}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Active subscriptions</p>
          <p className="mt-4 text-3xl font-semibold text-white">{summary.activeSubscriptions}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Outstanding invoices</p>
          <p className="mt-4 text-3xl font-semibold text-white">
            INR {summary.invoiceTotals.outstanding.toLocaleString("en-IN")}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Overdue</p>
          <p className="mt-4 text-3xl font-semibold text-white">{summary.invoiceTotals.overdue}</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">Subscriptions</h2>
              <p className="text-sm text-slate-400">Plan tier, status, and pricing per merchant.</p>
            </div>
            <Badge>{subscriptions.length}</Badge>
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            {subscriptions.map((sub) => (
              <div key={sub.id} className="glass-soft rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-white">{sub.merchant_name}</p>
                    <p className="mt-1 text-xs text-slate-500">{sub.merchant_email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                    <span className="glass-soft rounded-full px-3 py-1 capitalize">{sub.plan_code}</span>
                    <span className="glass-soft rounded-full px-3 py-1">{sub.status}</span>
                    <span className="glass-soft rounded-full px-3 py-1">
                      INR {Number(sub.monthly_price_inr).toLocaleString("en-IN")} / mo
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">Updated {new Date(sub.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">Recent invoices</h2>
              <p className="text-sm text-slate-400">Billing cycle snapshots and status.</p>
            </div>
            <Badge>{invoices.length}</Badge>
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="glass-soft rounded-2xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-white">{invoice.merchant_name}</p>
                    <p className="mt-1 text-xs text-slate-500">{invoice.invoice_number}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-white">INR {Number(invoice.total_inr).toLocaleString("en-IN")}</p>
                    <p className="mt-1 text-xs text-slate-500">Due {new Date(invoice.due_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                  <span className="glass-soft rounded-full px-3 py-1 capitalize">{invoice.plan_code}</span>
                  <span className="glass-soft rounded-full px-3 py-1">{invoice.status}</span>
                  <span className="glass-soft rounded-full px-3 py-1">
                    Paid INR {Number(invoice.paid_amount_inr).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
