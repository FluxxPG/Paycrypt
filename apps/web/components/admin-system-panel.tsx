"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { apiFetch } from "../lib/authed-fetch";

type QueueCounts = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
};

type SystemPayload = {
  uptimeSeconds: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers?: number;
  };
  db: { ok: boolean };
  redis: { ok: boolean };
  queues: {
    confirmations: QueueCounts;
    webhooks: QueueCounts;
    settlements: QueueCounts;
  };
};

type WorkerHeartbeat = {
  worker_name: string;
  status: string;
  last_seen_at: string;
  metadata: Record<string, unknown>;
};

type WsHealth = {
  node_id: string;
  clients_connected: number;
  latency_ms: number;
  last_seen_at: string;
};

export const AdminSystemPanel = () => {
  const [payload, setPayload] = useState<SystemPayload | null>(null);
  const [workers, setWorkers] = useState<WorkerHeartbeat[]>([]);
  const [wsNodes, setWsNodes] = useState<WsHealth[]>([]);
  const [wsLatency, setWsLatency] = useState<WsHealth[]>([]);
  const [alerts, setAlerts] = useState<
    Array<{ id: string; severity: string; source: string; message: string; created_at: string }>
  >([]);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      apiFetch<SystemPayload>("/admin/system"),
      apiFetch<{ data: WorkerHeartbeat[] }>("/admin/workers"),
      apiFetch<{ data: WsHealth[] }>("/admin/ws-health"),
      apiFetch<{ data: WsHealth[] }>("/admin/ws-latency"),
      apiFetch<{ data: Array<{ id: string; severity: string; source: string; message: string; created_at: string }> }>("/admin/alerts")
    ]).then(([systemPayload, workerPayload, wsPayload, latencyPayload, alertPayload]) => {
        if (!mounted) return;
        setPayload(systemPayload);
        setWorkers(workerPayload.data);
        setWsNodes(wsPayload.data);
        setWsLatency(latencyPayload.data);
        setAlerts(alertPayload.data);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const backlog = useMemo(() => {
    if (!payload) return 0;
    return Object.values(payload.queues).reduce(
      (sum, queue) => sum + queue.waiting + queue.active + queue.delayed,
      0
    );
  }, [payload]);

  if (!payload) {
    return <Card>Loading system health...</Card>;
  }

  const uptimeHours = Math.floor(payload.uptimeSeconds / 3600);
  const heapUsedMb = Math.round(payload.memory.heapUsed / 1024 / 1024);
  const rssMb = Math.round(payload.memory.rss / 1024 / 1024);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <p className="text-sm text-slate-400">Uptime</p>
          <p className="mt-4 text-3xl font-semibold text-white">{uptimeHours}h</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Heap usage</p>
          <p className="mt-4 text-3xl font-semibold text-white">{heapUsedMb} MB</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">RSS</p>
          <p className="mt-4 text-3xl font-semibold text-white">{rssMb} MB</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Queue backlog</p>
          <p className="mt-4 text-3xl font-semibold text-white">{backlog}</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">Core services</h2>
              <p className="text-sm text-slate-400">Database + Redis connectivity.</p>
            </div>
            <Badge>{payload.db.ok && payload.redis.ok ? "Healthy" : "Degraded"}</Badge>
          </div>
          <div className="mt-4 grid gap-3">
            <div className="glass-soft rounded-2xl p-4 text-sm text-slate-300">
              Database: <span className="text-white">{payload.db.ok ? "connected" : "down"}</span>
            </div>
            <div className="glass-soft rounded-2xl p-4 text-sm text-slate-300">
              Redis: <span className="text-white">{payload.redis.ok ? "connected" : "down"}</span>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">Queue health</h2>
              <p className="text-sm text-slate-400">BullMQ workload across pipelines.</p>
            </div>
            <Badge>Live</Badge>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {(
              [
                ["confirmations", payload.queues.confirmations],
                ["webhooks", payload.queues.webhooks],
                ["settlements", payload.queues.settlements]
              ] as const
            ).map(([label, queue]) => (
              <div key={label} className="glass-soft rounded-2xl p-4 text-xs text-slate-400">
                <p className="text-sm text-white capitalize">{label}</p>
                <p className="mt-2">Waiting: {queue.waiting}</p>
                <p>Active: {queue.active}</p>
                <p>Delayed: {queue.delayed}</p>
                <p>Failed: {queue.failed}</p>
                <p>Completed: {queue.completed}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">Worker heartbeats</h2>
            <p className="text-sm text-slate-400">Live worker health and queue mode.</p>
          </div>
          <Badge>{workers.length}</Badge>
        </div>
        <div className="mt-4 space-y-3 text-sm text-slate-300">
          {workers.map((worker) => (
            <div key={worker.worker_name} className="glass-soft rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-white">{worker.worker_name}</p>
                  <p className="mt-1 text-xs text-slate-500">{worker.status}</p>
                </div>
                <div className="text-xs text-slate-400">
                  Last seen {new Date(worker.last_seen_at).toLocaleString()}
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Mode: {(worker.metadata?.mode as string | undefined) ?? "unknown"}
              </p>
            </div>
          ))}
          {workers.length === 0 ? <p className="text-sm text-slate-400">No workers reporting yet.</p> : null}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">WebSocket latency probe</h2>
            <p className="text-sm text-slate-400">Redis RTT per gateway node.</p>
          </div>
          <Badge>{wsLatency.length}</Badge>
        </div>
        <div className="mt-4 space-y-3 text-sm text-slate-300">
          {wsLatency.map((node) => (
            <div key={node.node_id} className="glass-soft rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-white">{node.node_id}</p>
                  <p className="mt-1 text-xs text-slate-500">Latency: {node.latency_ms} ms</p>
                </div>
                <div className="text-xs text-slate-400">
                  Clients {node.clients_connected} - {new Date(node.last_seen_at).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
          {wsLatency.length === 0 ? <p className="text-sm text-slate-400">No data yet.</p> : null}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">WebSocket health</h2>
            <p className="text-sm text-slate-400">Active gateway nodes and connected clients.</p>
          </div>
          <Badge>{wsNodes.length}</Badge>
        </div>
        <div className="mt-4 space-y-3 text-sm text-slate-300">
          {wsNodes.map((node) => (
            <div key={node.node_id} className="glass-soft rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-white">{node.node_id}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Clients: {node.clients_connected} - Redis RTT: {node.latency_ms} ms
                  </p>
                </div>
                <div className="text-xs text-slate-400">
                  Last seen {new Date(node.last_seen_at).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
          {wsNodes.length === 0 ? <p className="text-sm text-slate-400">No gateways reporting yet.</p> : null}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">System alerts</h2>
            <p className="text-sm text-slate-400">Low balance, queue backlog, and infra warnings.</p>
          </div>
          <Badge>{alerts.length}</Badge>
        </div>
        <div className="mt-4 space-y-3 text-sm text-slate-300">
          {alerts.map((alert) => (
            <div key={alert.id} className="glass-soft rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-white">{alert.message}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {alert.source} - {alert.severity}
                  </p>
                </div>
                <div className="text-xs text-slate-400">{new Date(alert.created_at).toLocaleString()}</div>
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  className="text-xs text-cyan-200 hover:text-cyan-100"
                  onClick={async () => {
                    await apiFetch(`/admin/alerts/${alert.id}/resolve`, { method: "POST" });
                    const refreshed = await apiFetch<{ data: typeof alerts }>("/admin/alerts");
                    setAlerts(refreshed.data);
                  }}
                >
                  Mark as resolved
                </button>
              </div>
            </div>
          ))}
          {alerts.length === 0 ? <p className="text-sm text-slate-400">No alerts right now.</p> : null}
        </div>
      </Card>
    </div>
  );
};
