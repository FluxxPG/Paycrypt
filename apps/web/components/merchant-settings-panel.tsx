"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Eye, Save, SlidersHorizontal } from "lucide-react";
import { apiFetch } from "../lib/authed-fetch";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

type SupportedRoute = {
  asset: string;
  networks: string[];
};

type SettingsPayload = {
  acceptedRoutes: SupportedRoute[];
  supportedRoutes: SupportedRoute[];
};

type PreviewPayload = {
  paymentId: string;
  checkoutUrl: string;
};

const buildRouteMap = (routes: SupportedRoute[]) =>
  routes.reduce<Record<string, string[]>>((acc, route) => {
    acc[route.asset] = route.networks;
    return acc;
  }, {});

export const MerchantSettingsPanel = () => {
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [selectedRoutes, setSelectedRoutes] = useState<Record<string, string[]>>({});
  const [previewForm, setPreviewForm] = useState({
    amountFiat: 2499,
    fiatCurrency: "INR",
    settlementCurrency: "USDT",
    network: "TRC20",
    description: "Global checkout preview"
  });
  const [previewCheckoutUrl, setPreviewCheckoutUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "preview" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const payload = await apiFetch<SettingsPayload>("/dashboard/settings");
    setSettings(payload);
    setSelectedRoutes(buildRouteMap(payload.acceptedRoutes));
    setPreviewForm((current) => {
      const firstAsset = payload.acceptedRoutes[0]?.asset ?? payload.supportedRoutes[0]?.asset ?? "USDT";
      const firstNetwork =
        payload.acceptedRoutes[0]?.networks[0] ??
        payload.supportedRoutes.find((route) => route.asset === firstAsset)?.networks[0] ??
        "TRC20";
      return {
        ...current,
        settlementCurrency: firstAsset,
        network: firstNetwork
      };
    });
  };

  useEffect(() => {
    void load().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Failed to load settings");
    });
  }, []);

  const acceptedRouteCount = useMemo(
    () => Object.values(selectedRoutes).reduce((sum, networks) => sum + networks.length, 0),
    [selectedRoutes]
  );

  const previewNetworks = useMemo(
    () => selectedRoutes[previewForm.settlementCurrency] ?? [],
    [previewForm.settlementCurrency, selectedRoutes]
  );

  if (!settings) {
    return <Card>Loading checkout settings...</Card>;
  }

  const toggleRoute = (asset: string, network: string) => {
    setSelectedRoutes((current) => {
      const currentNetworks = new Set(current[asset] ?? []);
      if (currentNetworks.has(network)) {
        currentNetworks.delete(network);
      } else {
        currentNetworks.add(network);
      }

      const next = {
        ...current,
        [asset]: Array.from(currentNetworks)
      };

      if (previewForm.settlementCurrency === asset && !next[asset].includes(previewForm.network)) {
        const nextNetwork = next[asset][0];
        if (nextNetwork) {
          setPreviewForm((prev) => ({ ...prev, network: nextNetwork }));
        }
      }

      return next;
    });
  };

  const saveSettings = async () => {
    setBusy("save");
    setError(null);
    try {
      const acceptedRoutes = settings.supportedRoutes
        .map((route) => ({
          asset: route.asset,
          networks: route.networks.filter((network) => (selectedRoutes[route.asset] ?? []).includes(network))
        }))
        .filter((route) => route.networks.length > 0);

      const payload = await apiFetch<SettingsPayload>("/dashboard/settings", {
        method: "PATCH",
        body: JSON.stringify({ acceptedRoutes })
      });
      setSettings(payload);
      setSelectedRoutes(buildRouteMap(payload.acceptedRoutes));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save settings");
    } finally {
      setBusy(null);
    }
  };

  const createPreview = async () => {
    setBusy("preview");
    setError(null);
    try {
      const payload = await apiFetch<PreviewPayload>("/dashboard/checkout-preview", {
        method: "POST",
        body: JSON.stringify(previewForm)
      });
      setPreviewCheckoutUrl(payload.checkoutUrl);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Failed to create preview");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {error ? (
        <Card className="border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-medium text-white">Accepted checkout routes</p>
              <p className="mt-1 text-sm text-slate-400">
                These toggles define which currency and network combinations your checkout can accept.
              </p>
            </div>
            <SlidersHorizontal className="h-5 w-5 text-cyan-300" />
          </div>

          <div className="mt-6 space-y-4">
            {settings.supportedRoutes.map((route) => (
              <div key={route.asset} className="glass-soft rounded-3xl p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-lg text-white">{route.asset}</p>
                    <p className="text-xs text-slate-500">Choose which networks appear in checkout.</p>
                  </div>
                  <Badge>{(selectedRoutes[route.asset] ?? []).length} active</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {route.networks.map((network) => {
                    const enabled = (selectedRoutes[route.asset] ?? []).includes(network);
                    return (
                      <button
                        key={`${route.asset}-${network}`}
                        type="button"
                        onClick={() => toggleRoute(route.asset, network)}
                        className={`rounded-full px-4 py-2 text-sm transition ${
                          enabled
                            ? "bg-cyan-400 text-slate-950"
                            : "border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                        }`}
                      >
                        {network}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/8 bg-white/[0.03] p-4">
            <div>
              <p className="text-sm text-white">{acceptedRouteCount} checkout routes enabled</p>
              <p className="text-xs text-slate-500">At least one route must remain active.</p>
            </div>
            <Button onClick={saveSettings} disabled={busy === "save" || acceptedRouteCount === 0}>
              <Save className="mr-2 h-4 w-4" />
              {busy === "save" ? "Saving..." : "Save settings"}
            </Button>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-medium text-white">Payer preview</p>
                <p className="mt-1 text-sm text-slate-400">
                  Create a real preview checkout and inspect the exact page your customer will land on.
                </p>
              </div>
              <Eye className="h-5 w-5 text-cyan-300" />
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <input
                type="number"
                min="1"
                value={previewForm.amountFiat}
                onChange={(event) =>
                  setPreviewForm((prev) => ({ ...prev, amountFiat: Number(event.target.value || 0) }))
                }
                className="glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
                placeholder="Amount"
              />
              <input
                value={previewForm.fiatCurrency}
                onChange={(event) => setPreviewForm((prev) => ({ ...prev, fiatCurrency: event.target.value }))}
                className="glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
                placeholder="Fiat currency"
              />
              <select
                value={previewForm.settlementCurrency}
                onChange={(event) => {
                  const asset = event.target.value;
                  const firstNetwork = (selectedRoutes[asset] ?? [])[0] ?? "";
                  setPreviewForm((prev) => ({
                    ...prev,
                    settlementCurrency: asset,
                    network: firstNetwork
                  }));
                }}
                className="glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
              >
                {Object.entries(selectedRoutes)
                  .filter(([, networks]) => networks.length > 0)
                  .map(([asset]) => (
                    <option key={asset} value={asset} className="bg-slate-950">
                      {asset}
                    </option>
                  ))}
              </select>
              <select
                value={previewForm.network}
                onChange={(event) => setPreviewForm((prev) => ({ ...prev, network: event.target.value }))}
                className="glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
              >
                {previewNetworks.map((network) => (
                  <option key={network} value={network} className="bg-slate-950">
                    {network}
                  </option>
                ))}
              </select>
              <input
                value={previewForm.description}
                onChange={(event) => setPreviewForm((prev) => ({ ...prev, description: event.target.value }))}
                className="glass-soft md:col-span-2 w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
                placeholder="Preview description"
              />
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                onClick={createPreview}
                disabled={busy === "preview" || !previewForm.network || previewForm.amountFiat <= 0}
              >
                {busy === "preview" ? "Generating preview..." : "Generate hosted checkout preview"}
              </Button>
              {previewCheckoutUrl ? (
                <Button
                  variant="secondary"
                  onClick={() => window.open(previewCheckoutUrl, "_blank", "noopener,noreferrer")}
                >
                  <ArrowUpRight className="mr-2 h-4 w-4" />
                  Open full preview
                </Button>
              ) : null}
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-white/10 px-6 py-5">
              <p className="text-lg font-medium text-white">Live checkout canvas</p>
              <p className="text-sm text-slate-400">
                This uses the real `/pay/:id` experience, so the QR, address, timer, and status behavior are genuine.
              </p>
            </div>
            {previewCheckoutUrl ? (
              <iframe
                title="Hosted checkout preview"
                src={previewCheckoutUrl}
                className="h-[760px] w-full border-0 bg-slate-950"
              />
            ) : (
              <div className="grid min-h-[420px] place-items-center px-6 py-16 text-center text-sm text-slate-400">
                Generate a preview to inspect the payer-facing checkout before embedding the gateway.
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
