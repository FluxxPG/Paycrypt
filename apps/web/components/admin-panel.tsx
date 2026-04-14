"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, FileText, Gauge, ShieldCheck, Webhook } from "lucide-react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { apiFetch } from "../lib/authed-fetch";

type Merchant = {
  id: string;
  name: string;
  slug: string;
  email: string;
  status: string;
  custodial_enabled: boolean;
  non_custodial_enabled: boolean;
  plan_code: string | null;
  subscription_status: string | null;
};

type QueueCounts = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
};

type Analytics = {
  merchants: number;
  payments: Array<{ status: string; count: number; volume: number | string }>;
  revenue: Array<{ plan_code: string; merchants: number; mrr: number | string }>;
  monitoring: {
    queues: {
      confirmations: QueueCounts;
      webhooks: QueueCounts;
      settlements: QueueCounts;
    };
    webhookSummary: { total: number; delivered: number; failed: number };
    settlementSummary: { total: number; processed: number; volume: number | string };
    recentAuditLogs: Array<{
      actor_id: string;
      merchant_id: string | null;
      action: string;
      payload: Record<string, unknown>;
      created_at: string;
    }>;
    recentWebhookLogs: Array<{
      merchant_id: string;
      event_type: string;
      response_status: number | null;
      attempt: number;
      delivered_at: string | null;
      next_retry_at: string | null;
      created_at: string;
    }>;
    telemetry: {
      httpRequestsTotal: number;
      httpClientErrorsTotal: number;
      httpServerErrorsTotal: number;
      httpLatencyMsAverage: number;
      authJwtSuccessTotal: number;
      authJwtFailureTotal: number;
      authApiKeySuccessTotal: number;
      authApiKeyFailureTotal: number;
      rateLimitedTotal: number;
      idempotencyHitsTotal: number;
      paymentCreatedTotal: number;
      paymentPendingTotal: number;
      paymentConfirmedTotal: number;
      paymentFailedTotal: number;
      paymentExpiredTotal: number;
      webhookDeliveredTotal: number;
      webhookFailedTotal: number;
      settlementProcessedTotal: number;
      settlementFailedTotal: number;
      workerJobsCompletedTotal: number;
      workerJobsFailedTotal: number;
    };
  };
};

const formatTime = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });

export const AdminPanel = () => {
  const [merchants, setMerchants] = useState<Merchant[] | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  useEffect(() => {
    let mounted = true;
    Promise.all([apiFetch<{ data: Merchant[] }>("/admin/merchants"), apiFetch<Analytics>("/admin/analytics")]).then(
      ([merchantPayload, analyticsPayload]) => {
        if (!mounted) return;
        setMerchants(merchantPayload.data);
        setAnalytics(analyticsPayload);
      }
    );
    return () => {
      mounted = false;
    };
  }, []);

  const queueBacklog = useMemo(() => {
    if (!analytics) return 0;
    return Object.values(analytics.monitoring.queues).reduce(
      (sum, queue) => sum + queue.waiting + queue.active + queue.delayed,
      0
    );
  }, [analytics]);

  const failedJobs = useMemo(() => {
    if (!analytics) return 0;
    return Object.values(analytics.monitoring.queues).reduce((sum, queue) => sum + queue.failed, 0);
  }, [analytics]);

  const completedJobs = useMemo(() => {
    if (!analytics) return 0;
    return Object.values(analytics.monitoring.queues).reduce((sum, queue) => sum + queue.completed, 0);
  }, [analytics]);

  const webhookSuccessRate = useMemo(() => {
    if (!analytics?.monitoring.webhookSummary.total) return 0;
    return Math.round(
      (analytics.monitoring.webhookSummary.delivered / analytics.monitoring.webhookSummary.total) * 100
    );
  }, [analytics]);

  if (!merchants || !analytics) return <Card>Loading admin data...</Card>;

  const telemetry = analytics.monitoring.telemetry;
  const authFailures = telemetry.authJwtFailureTotal + telemetry.authApiKeyFailureTotal;
  const requestErrors = telemetry.httpClientErrorsTotal + telemetry.httpServerErrorsTotal;
  const requestErrorRate = telemetry.httpRequestsTotal
    ? Math.round((requestErrors / telemetry.httpRequestsTotal) * 100)
    : 0;

  const paymentStats = analytics.payments.reduce<Record<string, { count: number; volume: number }>>((acc, item) => {
    acc[item.status] = { count: Number(item.count), volume: Number(item.volume) };
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">Admin services</h2>
            <p className="text-sm text-slate-400">Jump into any control surface from the command deck.</p>
          </div>
          <Badge>Super Admin</Badge>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Merchants", href: "/admin/merchants" },
              { label: "Subscriptions", href: "/admin/subscriptions" },
              { label: "Wallets", href: "/admin/wallets" },
              { label: "Custody", href: "/admin/custody" },
              { label: "API Keys", href: "/admin/api-keys" },
              { label: "Webhooks", href: "/admin/webhooks" },
              { label: "Revenue", href: "/admin/revenue" },
              { label: "Risk & Alerts", href: "/admin/risk" }
            ].map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="glass-soft rounded-2xl px-4 py-3 text-sm text-slate-200 transition hover:bg-white/10"
            >
              {item.label}
            </a>
          ))}
        </div>
      </Card>
      <div id="overview" className="grid gap-6 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-slate-400">Merchants</p>
          <p className="mt-4 text-3xl font-semibold text-white">{analytics.merchants}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Confirmed payments</p>
          <p className="mt-4 text-3xl font-semibold text-white">{paymentStats.confirmed?.count ?? 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Queue backlog</p>
          <p className="mt-4 text-3xl font-semibold text-white">{queueBacklog}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Webhook success</p>
          <p className="mt-4 text-3xl font-semibold text-white">{webhookSuccessRate}%</p>
        </Card>
      </div>

      <div id="revenue" className="grid gap-6">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">Revenue mix</h2>
            <Badge>{analytics.revenue.length} plans</Badge>
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            {analytics.revenue.map((item) => (
              <div key={item.plan_code} className="glass-soft rounded-2xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-white capitalize">{item.plan_code}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.merchants} merchants - INR {Number(item.mrr).toLocaleString("en-IN")} MRR
                    </p>
                  </div>
                  <Gauge className="h-4 w-4 text-cyan-300" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div id="operations" className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">Queue health</h2>
              <p className="text-sm text-slate-400">BullMQ job health across confirmations, webhooks, and settlements.</p>
            </div>
            <Badge>{failedJobs} failed</Badge>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {(
              [
                ["confirmations", analytics.monitoring.queues.confirmations],
                ["webhooks", analytics.monitoring.queues.webhooks],
                ["settlements", analytics.monitoring.queues.settlements]
              ] as const
            ).map(([label, queue]) => (
              <div key={label} className="glass-soft rounded-2xl p-4">
                <p className="text-sm text-slate-100 capitalize">{label}</p>
                <div className="mt-3 space-y-2 text-xs text-slate-400">
                  <p>Waiting: {queue.waiting}</p>
                  <p>Active: {queue.active}</p>
                  <p>Delayed: {queue.delayed}</p>
                  <p>Failed: {queue.failed}</p>
                  <p>Completed: {queue.completed}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="glass-soft rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Completed jobs</p>
              <p className="mt-2 text-2xl font-semibold text-white">{completedJobs}</p>
            </div>
            <div className="glass-soft rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Backlog</p>
              <p className="mt-2 text-2xl font-semibold text-white">{queueBacklog}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="glass-soft rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Settlements</p>
              <p className="mt-2 text-2xl font-semibold text-white">{analytics.monitoring.settlementSummary.total}</p>
            </div>
            <div className="glass-soft rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Processed</p>
              <p className="mt-2 text-2xl font-semibold text-white">{analytics.monitoring.settlementSummary.processed}</p>
            </div>
            <div className="glass-soft rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Volume</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                INR {Number(analytics.monitoring.settlementSummary.volume).toLocaleString("en-IN")}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">Webhook delivery</h2>
              <p className="text-sm text-slate-400">Live webhook throughput and retry posture.</p>
            </div>
            <Badge>{webhookSuccessRate}%</Badge>
          </div>
          <div className="mt-6 space-y-3 text-sm text-slate-300">
            <div className="glass-soft rounded-2xl p-4">
              <div className="flex items-center justify-between gap-4">
                <span>Delivered</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-white">{analytics.monitoring.webhookSummary.delivered}</p>
            </div>
            <div className="glass-soft rounded-2xl p-4">
              <div className="flex items-center justify-between gap-4">
                <span>Failed</span>
                <AlertTriangle className="h-4 w-4 text-rose-300" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-white">{analytics.monitoring.webhookSummary.failed}</p>
            </div>
            <div className="glass-soft rounded-2xl p-4">
              <div className="flex items-center justify-between gap-4">
                <span>Total events</span>
                <Webhook className="h-4 w-4 text-cyan-300" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-white">{analytics.monitoring.webhookSummary.total}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card id="telemetry">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">Platform telemetry</h2>
            <p className="text-sm text-slate-400">Redis-backed counters for API pressure, auth, and lifecycle events.</p>
          </div>
          <Badge>{requestErrorRate}% errors</Badge>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">HTTP requests</p>
            <p className="mt-2 text-2xl font-semibold text-white">{telemetry.httpRequestsTotal}</p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Avg latency</p>
            <p className="mt-2 text-2xl font-semibold text-white">{telemetry.httpLatencyMsAverage.toFixed(1)} ms</p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Auth failures</p>
            <p className="mt-2 text-2xl font-semibold text-white">{authFailures}</p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Idempotency hits</p>
            <p className="mt-2 text-2xl font-semibold text-white">{telemetry.idempotencyHitsTotal}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Payments created</p>
            <p className="mt-2 text-2xl font-semibold text-white">{telemetry.paymentCreatedTotal}</p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Payments confirmed</p>
            <p className="mt-2 text-2xl font-semibold text-white">{telemetry.paymentConfirmedTotal}</p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Webhooks delivered</p>
            <p className="mt-2 text-2xl font-semibold text-white">{telemetry.webhookDeliveredTotal}</p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Settlements processed</p>
            <p className="mt-2 text-2xl font-semibold text-white">{telemetry.settlementProcessedTotal}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Rate limited</p>
            <p className="mt-2 text-2xl font-semibold text-white">{telemetry.rateLimitedTotal}</p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Payments pending</p>
            <p className="mt-2 text-2xl font-semibold text-white">{telemetry.paymentPendingTotal}</p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Worker jobs completed</p>
            <p className="mt-2 text-2xl font-semibold text-white">{telemetry.workerJobsCompletedTotal}</p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Worker jobs failed</p>
            <p className="mt-2 text-2xl font-semibold text-white">{telemetry.workerJobsFailedTotal}</p>
          </div>
        </div>
      </Card>

      <div id="audit" className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">Recent audit log</h2>
              <p className="text-sm text-slate-400">Platform mutations and merchant entitlement changes.</p>
            </div>
            <Badge>{analytics.monitoring.recentAuditLogs.length}</Badge>
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            {analytics.monitoring.recentAuditLogs.slice(0, 6).map((entry) => (
              <div key={`${entry.action}-${entry.created_at}`} className="glass-soft rounded-2xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-white">{entry.action}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      actor {entry.actor_id} - {entry.merchant_id ?? "platform"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{formatTime(entry.created_at)}</p>
                  </div>
                  <Clock3 className="h-4 w-4 text-cyan-300" />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">Recent webhook logs</h2>
              <p className="text-sm text-slate-400">Delivery attempts with retry telemetry.</p>
            </div>
            <Badge>{analytics.monitoring.recentWebhookLogs.length}</Badge>
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            {analytics.monitoring.recentWebhookLogs.slice(0, 6).map((entry) => (
              <div key={`${entry.event_type}-${entry.created_at}`} className="glass-soft rounded-2xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-white">{entry.event_type}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      status {entry.response_status ?? "n/a"} - attempt {entry.attempt}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatTime(entry.created_at)}
                      {entry.next_retry_at ? ` - retry ${formatTime(entry.next_retry_at)}` : ""}
                    </p>
                  </div>
                  <FileText className="h-4 w-4 text-cyan-300" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
