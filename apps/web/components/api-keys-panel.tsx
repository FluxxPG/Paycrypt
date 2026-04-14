"use client";

import { useEffect, useState } from "react";
import type { ApiKeyScope } from "@cryptopay/shared";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { apiFetch } from "../lib/authed-fetch";

type ApiKey = {
  id: string;
  name: string;
  key_type: "public" | "secret";
  key_prefix: string;
  scopes: string[];
  rate_limit_per_minute: number;
  last_used_at: string | null;
  created_at: string;
  is_active: boolean;
};

const apiKeyScopes: ApiKeyScope[] = [
  "payments:write",
  "payments:read",
  "payment_links:write",
  "transactions:read",
  "webhooks:write",
  "subscriptions:read",
  "billing:read",
  "settlements:read"
];

const scopeDetails: Record<ApiKeyScope, { title: string; description: string }> = {
  "payments:write": {
    title: "Create payments",
    description: "Allow payment intent creation through the API."
  },
  "payments:read": {
    title: "Read payments",
    description: "Inspect payment status and reconciliation data."
  },
  "payment_links:write": {
    title: "Create payment links",
    description: "Generate hosted payment links from integrations."
  },
  "transactions:read": {
    title: "Read transactions",
    description: "Fetch ledger entries and settlement activity."
  },
  "webhooks:write": {
    title: "Manage webhooks",
    description: "Register webhook endpoints and rotate secrets."
  },
  "subscriptions:read": {
    title: "Read subscriptions",
    description: "Inspect plan state and billing usage."
  },
  "billing:read": {
    title: "Read invoices",
    description: "Fetch billing invoices and invoice status."
  },
  "settlements:read": {
    title: "Read settlements",
    description: "Inspect settlement ledger records."
  }
};

export const ApiKeysPanel = () => {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [secretBundle, setSecretBundle] = useState<{ publicKey?: string; secretKey: string } | null>(null);
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState("120");
  const [selectedScopes, setSelectedScopes] = useState<ApiKeyScope[]>([...apiKeyScopes]);

  const load = async () => {
    const payload = await apiFetch<{ data: ApiKey[] }>("/dashboard/api-keys");
    setKeys(payload.data);
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleScope = (scope: ApiKeyScope) => {
    setSelectedScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]
    );
  };

  const toggleAllScopes = () => {
    setSelectedScopes((current) => (current.length === apiKeyScopes.length ? [] : [...apiKeyScopes]));
  };

  const createKey = async () => {
    const payload = await apiFetch<{ publicKey: string; secretKey: string }>("/dashboard/api-keys", {
      method: "POST",
      body: JSON.stringify({
        name: "Generated from dashboard",
        rateLimitPerMinute: Number(rateLimitPerMinute),
        scopes: selectedScopes
      })
    });
    setSecretBundle(payload);
    await load();
  };

  const rotateKey = async (id: string) => {
    const payload = await apiFetch<{ id: string; name: string; scopes: string[]; secretKey: string }>(
      `/dashboard/api-keys/${id}/rotate`,
      { method: "POST" }
    );
    setSecretBundle({ secretKey: payload.secretKey });
    await load();
  };

  const revokeKey = async (id: string) => {
    await apiFetch(`/dashboard/api-keys/${id}`, { method: "DELETE" });
    await load();
  };

  if (!keys) return <Card>Loading API keys...</Card>;

  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-lg font-medium text-white">API keys</p>
          <p className="text-sm text-slate-400">Public and secret key pairs with scoped permissions.</p>
        </div>
        <Badge>{selectedScopes.length}/{apiKeyScopes.length} scopes</Badge>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_220px_auto]">
        <div>
          <label className="mb-2 block text-sm text-slate-300">Rate limit / minute</label>
          <Input value={rateLimitPerMinute} onChange={(e) => setRateLimitPerMinute(e.target.value)} />
        </div>
        <div className="md:pt-7">
          <Button variant="secondary" onClick={createKey} disabled={selectedScopes.length === 0}>
            Generate pair
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-300">Scopes</p>
          <Button variant="ghost" onClick={toggleAllScopes}>
            {selectedScopes.length === apiKeyScopes.length ? "Clear all" : "Select all"}
          </Button>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {apiKeyScopes.map((scope) => {
            const details = scopeDetails[scope];
            const active = selectedScopes.includes(scope);
            return (
              <button
                key={scope}
                type="button"
                onClick={() => toggleScope(scope)}
                className={`glass-soft rounded-2xl border p-4 text-left transition ${
                  active ? "border-cyan-400/40 bg-cyan-400/10" : "border-white/10"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-white">{details.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{scope}</p>
                    <p className="mt-2 text-xs text-slate-400">{details.description}</p>
                  </div>
                  <Badge className={active ? "bg-cyan-400/20 text-cyan-100" : ""}>
                    {active ? "On" : "Off"}
                  </Badge>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 space-y-3 text-sm text-slate-300">
        {secretBundle ? (
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">One-time secret</p>
            {secretBundle.publicKey ? <p className="mt-2 font-mono text-xs text-slate-400">{secretBundle.publicKey}</p> : null}
            <p className="mt-2 break-all font-mono text-sm text-white">{secretBundle.secretKey}</p>
          </div>
        ) : null}
        {keys.map((key) => (
          <div key={key.id} className="glass-soft rounded-2xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-white">{key.name}</span>
                <p className="mt-1 text-xs text-slate-500">
                  {key.key_type} - {key.rate_limit_per_minute}/min - {key.is_active ? "active" : "revoked"}
                </p>
                <p className="mt-2 text-xs text-slate-400">Scopes: {key.scopes.join(", ")}</p>
              </div>
              {key.key_type === "secret" ? (
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => rotateKey(key.id)} disabled={!key.is_active}>
                    Rotate
                  </Button>
                  <Button variant="ghost" onClick={() => revokeKey(key.id)} disabled={!key.is_active}>
                    Revoke
                  </Button>
                </div>
              ) : null}
            </div>
            <p className="mt-2 font-mono text-xs text-slate-400">{key.key_prefix}</p>
          </div>
        ))}
      </div>
    </Card>
  );
};
