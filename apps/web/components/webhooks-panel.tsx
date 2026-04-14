"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { apiFetch } from "../lib/authed-fetch";

type WebhookEndpoint = {
  id: string;
  target_url: string;
  events: string[];
  is_active: boolean;
  secret_version: number;
  last_rotated_at: string | null;
  created_at: string;
};

const eventOptions = [
  "payment.created",
  "payment.pending",
  "payment.confirmed",
  "payment.failed"
] as const;

export const WebhooksPanel = () => {
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[] | null>(null);
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    "payment.created",
    "payment.confirmed",
    "payment.failed"
  ]);
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const payload = await apiFetch<{ data: WebhookEndpoint[] }>("/dashboard/webhooks");
    setWebhooks(payload.data);
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleEvent = (event: string) => {
    setSelectedEvents((current) =>
      current.includes(event) ? current.filter((item) => item !== event) : [...current, event]
    );
  };

  const createWebhook = async () => {
    if (!url.trim()) {
      return;
    }
    setBusy(true);
    try {
      const payload = await apiFetch<{ id: string; secret: string }>("/dashboard/webhooks", {
        method: "POST",
        body: JSON.stringify({
          url,
          events: selectedEvents,
          isActive: true
        })
      });
      setGeneratedSecret(payload.secret);
      setUrl("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const rotateWebhook = async (id: string) => {
    setBusy(true);
    try {
      const payload = await apiFetch<{ id: string; secret: string; secretVersion: number }>(
        `/dashboard/webhooks/${id}/rotate`,
        { method: "POST" }
      );
      setGeneratedSecret(payload.secret);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    try {
      await apiFetch(`/dashboard/webhooks/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = useMemo(() => url.trim().length > 0 && selectedEvents.length > 0, [url, selectedEvents]);

  if (!webhooks) return <Card>Loading webhooks...</Card>;

  return (
    <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      <Card>
        <p className="text-lg font-medium text-white">Create webhook endpoint</p>
        <p className="mt-1 text-sm text-slate-400">Secrets are generated once and rotated on demand.</p>
        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-2 block text-sm text-slate-300">Target URL</label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://merchant.example/webhooks" />
          </div>
          <div>
            <p className="mb-2 text-sm text-slate-300">Events</p>
            <div className="grid gap-2">
              {eventOptions.map((event) => (
                <label key={event} className="glass-soft flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(event)}
                    onChange={() => toggleEvent(event)}
                  />
                  {event}
                </label>
              ))}
            </div>
          </div>
          <Button onClick={createWebhook} disabled={!canSubmit || busy}>
            Create endpoint
          </Button>
          {generatedSecret ? (
            <div className="glass-soft rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Webhook secret</p>
              <p className="mt-2 break-all font-mono text-sm text-white">{generatedSecret}</p>
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-lg font-medium text-white">Webhook endpoints</p>
            <p className="text-sm text-slate-400">Event delivery, signature verification, and retry audit trail.</p>
          </div>
          <Badge>{webhooks.length}</Badge>
        </div>
        <div className="mt-6 space-y-3 text-sm text-slate-300">
          {webhooks.map((webhook) => (
            <div key={webhook.id} className="glass-soft rounded-2xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-white">{webhook.target_url}</p>
                  <p className="mt-1 text-xs text-slate-400">{webhook.events.join(", ")}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    v{webhook.secret_version} {webhook.last_rotated_at ? `- rotated ${new Date(webhook.last_rotated_at).toLocaleString()}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => rotateWebhook(webhook.id)} disabled={busy}>
                    Rotate
                  </Button>
                  <Button variant="ghost" onClick={() => revoke(webhook.id)} disabled={busy}>
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
