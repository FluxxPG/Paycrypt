"use client";

import { useEffect, useState } from "react";
import { PlugZap, RefreshCw, Store, Unplug } from "lucide-react";
import { apiFetch } from "../lib/authed-fetch";
import { Card } from "./ui/card";
import { Button } from "./ui/button";

type PlatformConnection = {
  id: string;
  platform: "shopify" | "woocommerce" | "wordpress" | "opencart";
  store_domain: string;
  store_name: string;
  status: "pending" | "connected" | "syncing" | "error" | "disconnected" | "suspended";
  last_sync_at: string | null;
  updated_at: string;
};

const supportedPlatforms: Array<PlatformConnection["platform"]> = ["shopify", "woocommerce", "wordpress", "opencart"];

export const MerchantIntegrationsPanel = () => {
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [platform, setPlatform] = useState<PlatformConnection["platform"]>("shopify");
  const [storeDomain, setStoreDomain] = useState("");
  const [storeName, setStoreName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadConnections = async () => {
    setError(null);
    try {
      const response = await apiFetch<{ data: PlatformConnection[] }>("/dashboard/integrations");
      setConnections(response.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load integrations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConnections();
  }, []);

  const connect = async () => {
    if (!storeDomain.trim()) return;
    setBusy("connect");
    try {
      await apiFetch("/dashboard/integrations/connect", {
        method: "POST",
        body: JSON.stringify({ platform, storeDomain, storeName })
      });
      setStoreDomain("");
      setStoreName("");
      await loadConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect store");
    } finally {
      setBusy(null);
    }
  };

  const sync = async (id: string) => {
    setBusy(`sync:${id}`);
    try {
      await apiFetch(`/dashboard/integrations/${id}/sync`, { method: "POST" });
      await loadConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync connection");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (id: string) => {
    setBusy(`disconnect:${id}`);
    try {
      await apiFetch(`/dashboard/integrations/${id}`, { method: "DELETE" });
      await loadConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect connection");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {error ? <Card className="border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100">{error}</Card> : null}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-white">One-click Store Connect</h3>
        <p className="mt-1 text-sm text-slate-300">
          Connect your Shopify, WooCommerce, WordPress, or OpenCart store without custom API implementation.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <select
            value={platform}
            onChange={(event) => setPlatform(event.target.value as PlatformConnection["platform"])}
            className="glass-soft rounded-xl px-3 py-2 text-sm text-slate-100"
          >
            {supportedPlatforms.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input
            value={storeDomain}
            onChange={(event) => setStoreDomain(event.target.value)}
            placeholder="store domain (eg shop.example.com)"
            className="glass-soft rounded-xl px-3 py-2 text-sm text-slate-100"
          />
          <input
            value={storeName}
            onChange={(event) => setStoreName(event.target.value)}
            placeholder="store name"
            className="glass-soft rounded-xl px-3 py-2 text-sm text-slate-100"
          />
          <Button onClick={connect} disabled={busy === "connect" || !storeDomain.trim()} className="bg-cyan-400 text-slate-950">
            <PlugZap className="mr-2 h-4 w-4" />
            {busy === "connect" ? "Connecting..." : "Connect store"}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold text-white">Connected Stores</h3>
        {loading ? <p className="mt-3 text-slate-300">Loading integrations...</p> : null}
        {!loading && connections.length === 0 ? (
          <p className="mt-3 text-slate-400">No stores connected yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {connections.map((connection) => (
              <div key={connection.id} className="glass-soft rounded-xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-white">
                      <Store className="h-4 w-4" />
                      {connection.store_name} ({connection.platform})
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {connection.store_domain} · status: {connection.status} · last sync:{" "}
                      {connection.last_sync_at ? new Date(connection.last_sync_at).toLocaleString() : "Never"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="glass-soft"
                      onClick={() => sync(connection.id)}
                      disabled={busy === `sync:${connection.id}` || connection.status !== "connected"}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Sync
                    </Button>
                    <Button
                      className="glass-soft text-rose-300"
                      onClick={() => disconnect(connection.id)}
                      disabled={busy === `disconnect:${connection.id}` || connection.status === "disconnected"}
                    >
                      <Unplug className="mr-2 h-4 w-4" />
                      Disconnect
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

