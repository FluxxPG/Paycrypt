"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiFetch } from "../lib/authed-fetch";
import { Card } from "./ui/card";
import { Button } from "./ui/button";

type SummaryRow = {
  platform: string;
  total: number;
  connected: number;
  errored: number;
  last_sync_at: string | null;
};

type ConnectionRow = {
  id: string;
  merchant_id: string;
  merchant_name: string;
  merchant_email: string;
  platform: string;
  store_domain: string;
  store_name: string;
  status: "pending" | "connected" | "syncing" | "error" | "disconnected" | "suspended";
  last_sync_at: string | null;
  updated_at: string;
};

export const AdminIntegrationsPanel = () => {
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = async () => {
    const response = await apiFetch<{ summary: SummaryRow[]; connections: ConnectionRow[] }>("/admin/integrations");
    setSummary(response.summary ?? []);
    setConnections(response.connections ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(
    () =>
      connections.filter((row) => {
        const matchesStatus = statusFilter === "all" || row.status === statusFilter;
        const q = search.trim().toLowerCase();
        const matchesSearch =
          !q ||
          row.merchant_name.toLowerCase().includes(q) ||
          row.store_domain.toLowerCase().includes(q) ||
          row.platform.toLowerCase().includes(q);
        return matchesStatus && matchesSearch;
      }),
    [connections, search, statusFilter]
  );

  const updateStatus = async (id: string, status: ConnectionRow["status"]) => {
    setBusy(`${id}:${status}`);
    try {
      await apiFetch(`/admin/integrations/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        {summary.map((item) => (
          <Card key={item.platform} className="p-5">
            <p className="text-sm uppercase text-slate-400">{item.platform}</p>
            <p className="mt-3 text-2xl text-white">{item.connected}/{item.total}</p>
            <p className="mt-1 text-xs text-slate-500">Errored: {item.errored}</p>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search merchant/store/platform"
            className="glass-soft rounded-xl px-3 py-2 text-sm text-slate-100"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="glass-soft rounded-xl px-3 py-2 text-sm text-slate-100"
          >
            <option value="all">All statuses</option>
            <option value="connected">Connected</option>
            <option value="suspended">Suspended</option>
            <option value="error">Error</option>
            <option value="disconnected">Disconnected</option>
          </select>
          <Button className="glass-soft" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
        {loading ? <p className="text-slate-300">Loading integrations...</p> : null}
        {!loading && (
          <div className="space-y-3">
            {filtered.map((item) => (
              <div key={item.id} className="glass-soft rounded-xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-white">
                      {item.merchant_name} · {item.store_name} ({item.platform})
                    </p>
                    <p className="text-xs text-slate-400">
                      {item.store_domain} · {item.merchant_email} · status: {item.status}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="glass-soft"
                      onClick={() => updateStatus(item.id, "connected")}
                      disabled={busy === `${item.id}:connected`}
                    >
                      Enable
                    </Button>
                    <Button
                      className="glass-soft text-amber-300"
                      onClick={() => updateStatus(item.id, "suspended")}
                      disabled={busy === `${item.id}:suspended`}
                    >
                      Suspend
                    </Button>
                    <Button
                      className="glass-soft text-rose-300"
                      onClick={() => updateStatus(item.id, "disconnected")}
                      disabled={busy === `${item.id}:disconnected`}
                    >
                      Disconnect
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {!filtered.length ? <p className="text-sm text-slate-500">No connections found.</p> : null}
          </div>
        )}
      </Card>
    </div>
  );
};

