"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { apiFetch } from "../lib/authed-fetch";

type Merchant = {
  id: string;
  name: string;
  email: string;
};

type WebhookRow = {
  id: string;
  target_url: string;
  events: string[];
  is_active: boolean;
  secret_version: number;
  last_rotated_at: string | null;
  created_at: string;
  merchant_id: string;
  merchant_name: string;
  merchant_email: string;
};

export const AdminWebhooksPanel = () => {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>("");
  const [endpoints, setEndpoints] = useState<WebhookRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [latestSecret, setLatestSecret] = useState<string | null>(null);

  const selectedMerchant = useMemo(
    () => merchants.find((merchant) => merchant.id === selectedMerchantId) ?? null,
    [merchants, selectedMerchantId]
  );

  const loadEndpoints = async (merchantId?: string) => {
    const payload = await apiFetch<{ data: WebhookRow[] }>(
      merchantId ? `/admin/webhooks?merchantId=${merchantId}` : "/admin/webhooks"
    );
    setEndpoints(payload.data);
  };

  useEffect(() => {
    apiFetch<{ data: Merchant[] }>("/admin/merchants").then((payload) => {
      setMerchants(payload.data);
      setSelectedMerchantId((current) => current || payload.data[0]?.id || "");
    });
  }, []);

  useEffect(() => {
    void loadEndpoints(selectedMerchantId || undefined);
  }, [selectedMerchantId]);

  const toggleActive = async (endpointId: string, isActive: boolean) => {
    if (!selectedMerchantId) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/webhooks/${endpointId}`, {
        method: "PATCH",
        body: JSON.stringify({ merchantId: selectedMerchantId, isActive })
      });
      await loadEndpoints(selectedMerchantId);
    } finally {
      setBusy(false);
    }
  };

  const rotateSecret = async (endpointId: string) => {
    if (!selectedMerchantId) return;
    setBusy(true);
    try {
      const payload = await apiFetch<{ secret: string }>(`/admin/webhooks/${endpointId}/rotate`, {
        method: "POST",
        body: JSON.stringify({ merchantId: selectedMerchantId })
      });
      setLatestSecret(payload.secret);
      await loadEndpoints(selectedMerchantId);
    } finally {
      setBusy(false);
    }
  };

  const revokeEndpoint = async (endpointId: string) => {
    if (!selectedMerchantId) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/webhooks/${endpointId}`, {
        method: "DELETE",
        body: JSON.stringify({ merchantId: selectedMerchantId })
      });
      await loadEndpoints(selectedMerchantId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">Webhook registry</h2>
            <p className="text-sm text-slate-400">Review webhook endpoints and rotate secrets.</p>
          </div>
          <Badge>{selectedMerchant?.name ?? "Select merchant"}</Badge>
        </div>
        <div className="mt-6">
          <select
            value={selectedMerchantId}
            onChange={(event) => setSelectedMerchantId(event.target.value)}
            className="glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none md:max-w-sm"
          >
            {merchants.map((merchant) => (
              <option key={merchant.id} value={merchant.id} className="bg-slate-900">
                {merchant.name}
              </option>
            ))}
          </select>
        </div>
        {latestSecret ? (
          <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            New webhook secret: <span className="font-semibold">{latestSecret}</span>
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">Endpoints</h2>
            <p className="text-sm text-slate-400">Active delivery targets for payment events.</p>
          </div>
          <Badge>{endpoints.length}</Badge>
        </div>
        <div className="mt-4 space-y-3 text-sm text-slate-300">
          {endpoints.map((endpoint) => (
            <div key={endpoint.id} className="glass-soft rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-white">{endpoint.target_url}</p>
                  <p className="mt-1 text-xs text-slate-500">{endpoint.events.join(", ")}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                  <span className="glass-soft rounded-full px-3 py-1">
                    {endpoint.is_active ? "active" : "paused"}
                  </span>
                  <span className="glass-soft rounded-full px-3 py-1">v{endpoint.secret_version}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => toggleActive(endpoint.id, !endpoint.is_active)}
                    disabled={busy}
                  >
                    {endpoint.is_active ? "Pause" : "Resume"}
                  </Button>
                  <Button variant="secondary" onClick={() => rotateSecret(endpoint.id)} disabled={busy}>
                    Rotate secret
                  </Button>
                  <Button onClick={() => revokeEndpoint(endpoint.id)} disabled={busy}>
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {endpoints.length === 0 ? (
            <p className="text-sm text-slate-400">No endpoints registered.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
};
