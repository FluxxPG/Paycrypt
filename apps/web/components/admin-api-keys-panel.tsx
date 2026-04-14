"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { apiFetch } from "../lib/authed-fetch";

type Merchant = {
  id: string;
  name: string;
  email: string;
};

type ApiKeyRow = {
  id: string;
  name: string;
  key_type: string;
  key_prefix: string;
  scopes: string[];
  rate_limit_per_minute: number;
  last_used_at: string | null;
  created_at: string;
  is_active: boolean;
  merchant_id: string;
  merchant_name: string;
  merchant_email: string;
};

export const AdminApiKeysPanel = () => {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>("");
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [createdSecrets, setCreatedSecrets] = useState<{ publicKey: string; secretKey: string } | null>(null);
  const [form, setForm] = useState({
    name: "",
    scopes: "payments:write,payments:read,webhooks:read",
    rateLimitPerMinute: "120"
  });

  const selectedMerchant = useMemo(
    () => merchants.find((merchant) => merchant.id === selectedMerchantId) ?? null,
    [merchants, selectedMerchantId]
  );

  const loadKeys = async (merchantId?: string) => {
    const payload = await apiFetch<{ data: ApiKeyRow[] }>(
      merchantId ? `/admin/api-keys?merchantId=${merchantId}` : "/admin/api-keys"
    );
    setKeys(payload.data);
  };

  useEffect(() => {
    apiFetch<{ data: Merchant[] }>("/admin/merchants").then((payload) => {
      setMerchants(payload.data);
      setSelectedMerchantId((current) => current || payload.data[0]?.id || "");
    });
  }, []);

  useEffect(() => {
    void loadKeys(selectedMerchantId || undefined);
  }, [selectedMerchantId]);

  const createKeys = async () => {
    if (!selectedMerchantId) return;
    setBusy(true);
    try {
      const payload = await apiFetch<{ publicKey: string; secretKey: string }>("/admin/api-keys", {
        method: "POST",
        body: JSON.stringify({
          merchantId: selectedMerchantId,
          name: form.name || "Default key",
          scopes: form.scopes.split(",").map((scope) => scope.trim()),
          rateLimitPerMinute: Number(form.rateLimitPerMinute)
        })
      });
      setCreatedSecrets({ publicKey: payload.publicKey, secretKey: payload.secretKey });
      await loadKeys(selectedMerchantId);
    } finally {
      setBusy(false);
    }
  };

  const rotateKey = async (keyId: string) => {
    if (!selectedMerchantId) return;
    setBusy(true);
    try {
      const payload = await apiFetch<{ secretKey: string }>(`/admin/api-keys/${keyId}/rotate`, {
        method: "POST",
        body: JSON.stringify({ merchantId: selectedMerchantId })
      });
      setCreatedSecrets({ publicKey: "", secretKey: payload.secretKey });
      await loadKeys(selectedMerchantId);
    } finally {
      setBusy(false);
    }
  };

  const revokeKey = async (keyId: string) => {
    if (!selectedMerchantId) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/api-keys/${keyId}`, {
        method: "DELETE",
        body: JSON.stringify({ merchantId: selectedMerchantId })
      });
      await loadKeys(selectedMerchantId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">API key provisioning</h2>
            <p className="text-sm text-slate-400">Issue, rotate, and revoke keys per merchant.</p>
          </div>
          <Badge>{selectedMerchant?.name ?? "Select merchant"}</Badge>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <select
            value={selectedMerchantId}
            onChange={(event) => setSelectedMerchantId(event.target.value)}
            className="glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
          >
            {merchants.map((merchant) => (
              <option key={merchant.id} value={merchant.id} className="bg-slate-900">
                {merchant.name}
              </option>
            ))}
          </select>
          <Input
            placeholder="Key name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <Input
            placeholder="Scopes comma-separated"
            value={form.scopes}
            onChange={(event) => setForm((prev) => ({ ...prev, scopes: event.target.value }))}
          />
          <Button onClick={createKeys} disabled={busy}>
            Create keys
          </Button>
        </div>
        {createdSecrets ? (
          <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {createdSecrets.publicKey ? (
              <p>
                Public key: <span className="font-semibold">{createdSecrets.publicKey}</span>
              </p>
            ) : null}
            <p>
              Secret key: <span className="font-semibold">{createdSecrets.secretKey}</span>
            </p>
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">Issued API keys</h2>
            <p className="text-sm text-slate-400">Live key inventory for the selected merchant.</p>
          </div>
          <Badge>{keys.length}</Badge>
        </div>
        <div className="mt-4 space-y-3 text-sm text-slate-300">
          {keys.map((key) => (
            <div key={key.id} className="glass-soft rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
              <p className="text-white">
                {key.name} - {key.key_type}
              </p>
              <p className="mt-1 text-xs text-slate-500">{key.key_prefix}...</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                  <span className="glass-soft rounded-full px-3 py-1">{key.is_active ? "active" : "revoked"}</span>
                  <span className="glass-soft rounded-full px-3 py-1">
                    {key.rate_limit_per_minute} rpm
                  </span>
                  <span className="glass-soft rounded-full px-3 py-1">{key.scopes.join(", ")}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {key.key_type === "secret" ? (
                    <Button variant="secondary" onClick={() => rotateKey(key.id)} disabled={busy}>
                      Rotate
                    </Button>
                  ) : null}
                  <Button onClick={() => revokeKey(key.id)} disabled={busy || !key.is_active}>
                    Revoke
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
