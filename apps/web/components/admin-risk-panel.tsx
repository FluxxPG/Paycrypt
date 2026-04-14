"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { apiFetch } from "../lib/authed-fetch";

type QueueCounts = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
};

type RiskPayload = {
  queues: {
    confirmations: QueueCounts;
    webhooks: QueueCounts;
    settlements: QueueCounts;
  };
  webhookSummary: { total: number; delivered: number; failed: number };
  telemetry: {
    httpRequestsTotal: number;
    httpClientErrorsTotal: number;
    httpServerErrorsTotal: number;
    httpLatencyMsAverage: number;
    authJwtFailureTotal: number;
    authApiKeyFailureTotal: number;
    rateLimitedTotal: number;
    idempotencyHitsTotal: number;
    workerJobsFailedTotal: number;
  };
};

export const AdminRiskPanel = () => {
  const [payload, setPayload] = useState<RiskPayload | null>(null);

  useEffect(() => {
    let mounted = true;
    apiFetch<RiskPayload>("/admin/risk").then((data) => {
      if (!mounted) return;
      setPayload(data);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const queueBacklog = useMemo(() => {
    if (!payload) return 0;
    return Object.values(payload.queues).reduce(
      (sum, queue) => sum + queue.waiting + queue.active + queue.delayed,
      0
    );
  }, [payload]);

  if (!payload) {
    return <Card>Loading risk telemetry...</Card>;
  }

  const authFailures = payload.telemetry.authJwtFailureTotal + payload.telemetry.authApiKeyFailureTotal;
  const requestErrors = payload.telemetry.httpClientErrorsTotal + payload.telemetry.httpServerErrorsTotal;
  const errorRate = payload.telemetry.httpRequestsTotal
    ? Math.round((requestErrors / payload.telemetry.httpRequestsTotal) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <p className="text-sm text-slate-400">Queue backlog</p>
          <p className="mt-4 text-3xl font-semibold text-white">{queueBacklog}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Webhook failure</p>
          <p className="mt-4 text-3xl font-semibold text-white">
            {payload.webhookSummary.total
              ? Math.round((payload.webhookSummary.failed / payload.webhookSummary.total) * 100)
              : 0}
            %
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Auth failures</p>
          <p className="mt-4 text-3xl font-semibold text-white">{authFailures}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Error rate</p>
          <p className="mt-4 text-3xl font-semibold text-white">{errorRate}%</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">Queue status</h2>
              <p className="text-sm text-slate-400">BullMQ job health across pipeline stages.</p>
            </div>
            <Badge>{payload.telemetry.workerJobsFailedTotal} failed jobs</Badge>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {(
              [
                ["confirmations", payload.queues.confirmations],
                ["webhooks", payload.queues.webhooks],
                ["settlements", payload.queues.settlements]
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
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">Webhook delivery</h2>
              <p className="text-sm text-slate-400">Last 7 days delivery posture.</p>
            </div>
            <Badge>{payload.webhookSummary.total} events</Badge>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="glass-soft rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Delivered</p>
              <p className="mt-2 text-2xl font-semibold text-white">{payload.webhookSummary.delivered}</p>
            </div>
            <div className="glass-soft rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Failed</p>
              <p className="mt-2 text-2xl font-semibold text-white">{payload.webhookSummary.failed}</p>
            </div>
            <div className="glass-soft rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
              <p className="mt-2 text-2xl font-semibold text-white">{payload.webhookSummary.total}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">Platform telemetry</h2>
            <p className="text-sm text-slate-400">API health, latency, and rate limiting signals.</p>
          </div>
          <Badge>Latency {payload.telemetry.httpLatencyMsAverage.toFixed(1)} ms</Badge>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Requests</p>
            <p className="mt-2 text-2xl font-semibold text-white">{payload.telemetry.httpRequestsTotal}</p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Client errors</p>
            <p className="mt-2 text-2xl font-semibold text-white">{payload.telemetry.httpClientErrorsTotal}</p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Server errors</p>
            <p className="mt-2 text-2xl font-semibold text-white">{payload.telemetry.httpServerErrorsTotal}</p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Rate limited</p>
            <p className="mt-2 text-2xl font-semibold text-white">{payload.telemetry.rateLimitedTotal}</p>
          </div>
        </div>
      </Card>
    </div>
  );
};
