"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Eye, Save, SlidersHorizontal, Sparkles } from "lucide-react";
import { apiFetch } from "../lib/authed-fetch";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

type SupportedRoute = {
  asset: string;
  networks: string[];
};

type CheckoutRoute = {
  asset: string;
  network: string;
};

type SettingsPayload = {
  acceptedRoutes: SupportedRoute[];
  supportedRoutes: SupportedRoute[];
  defaultRoute: CheckoutRoute;
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

const routeKey = (route: CheckoutRoute) => `${route.asset}:${route.network}`;

const buildEnabledRoutes = (supportedRoutes: SupportedRoute[], selectedRoutes: Record<string, string[]>) =>
  supportedRoutes.flatMap((route) =>
    route.networks
      .filter((network) => (selectedRoutes[route.asset] ?? []).includes(network))
      .map((network) => ({
        asset: route.asset,
        network
      }))
  );

const pickFallbackRoute = (
  supportedRoutes: SupportedRoute[],
  selectedRoutes: Record<string, string[]>,
  preferredRoute?: CheckoutRoute | null
) => {
  const enabledRoutes = buildEnabledRoutes(supportedRoutes, selectedRoutes);
  if (!enabledRoutes.length) {
    return null;
  }

  if (preferredRoute) {
    const matchingRoute = enabledRoutes.find((route) => routeKey(route) === routeKey(preferredRoute));
    if (matchingRoute) {
      return matchingRoute;
    }
  }

  return enabledRoutes[0];
};

export const MerchantSettingsPanel = () => {
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [selectedRoutes, setSelectedRoutes] = useState<Record<string, string[]>>({});
  const [selectedDefaultRouteKey, setSelectedDefaultRouteKey] = useState("");
  const [previewMode, setPreviewMode] = useState<"default" | "override">("default");
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
    const routeMap = buildRouteMap(payload.acceptedRoutes);
    const fallbackRoute = pickFallbackRoute(payload.supportedRoutes, routeMap, payload.defaultRoute);

    setSettings(payload);
    setSelectedRoutes(routeMap);
    setSelectedDefaultRouteKey(fallbackRoute ? routeKey(fallbackRoute) : "");
    setPreviewForm((current) => ({
      ...current,
      settlementCurrency: fallbackRoute?.asset ?? current.settlementCurrency,
      network: fallbackRoute?.network ?? current.network
    }));
  };

  useEffect(() => {
    void load().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Failed to load settings");
    });
  }, []);

  const enabledRoutes = useMemo(
    () => (settings ? buildEnabledRoutes(settings.supportedRoutes, selectedRoutes) : []),
    [selectedRoutes, settings]
  );

  const activeDefaultRoute = useMemo(
    () => enabledRoutes.find((route) => routeKey(route) === selectedDefaultRouteKey) ?? enabledRoutes[0] ?? null,
    [enabledRoutes, selectedDefaultRouteKey]
  );

  const acceptedRouteCount = enabledRoutes.length;

  const previewNetworks = useMemo(
    () => selectedRoutes[previewForm.settlementCurrency] ?? [],
    [previewForm.settlementCurrency, selectedRoutes]
  );

  useEffect(() => {
    if (!activeDefaultRoute) {
      if (selectedDefaultRouteKey) {
        setSelectedDefaultRouteKey("");
      }
      return;
    }

    const key = routeKey(activeDefaultRoute);
    if (key !== selectedDefaultRouteKey) {
      setSelectedDefaultRouteKey(key);
    }
  }, [activeDefaultRoute, selectedDefaultRouteKey]);

  useEffect(() => {
    if (!activeDefaultRoute || previewMode !== "default") {
      return;
    }

    setPreviewForm((current) => {
      if (
        current.settlementCurrency === activeDefaultRoute.asset &&
        current.network === activeDefaultRoute.network
      ) {
        return current;
      }

      return {
        ...current,
        settlementCurrency: activeDefaultRoute.asset,
        network: activeDefaultRoute.network
      };
    });
  }, [activeDefaultRoute, previewMode]);

  useEffect(() => {
    if (previewMode !== "override") {
      return;
    }

    const availableNetworks = selectedRoutes[previewForm.settlementCurrency] ?? [];
    if (availableNetworks.length && availableNetworks.includes(previewForm.network)) {
      return;
    }

    const fallbackRoute = pickFallbackRoute(settings?.supportedRoutes ?? [], selectedRoutes, activeDefaultRoute);
    if (!fallbackRoute) {
      return;
    }

    setPreviewForm((current) => ({
      ...current,
      settlementCurrency: availableNetworks.length ? current.settlementCurrency : fallbackRoute.asset,
      network: availableNetworks[0] ?? fallbackRoute.network
    }));
  }, [activeDefaultRoute, previewForm.network, previewForm.settlementCurrency, previewMode, selectedRoutes, settings]);

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

      return {
        ...current,
        [asset]: Array.from(currentNetworks)
      };
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

      const fallbackRoute = pickFallbackRoute(settings.supportedRoutes, selectedRoutes, activeDefaultRoute);
      if (!fallbackRoute) {
        throw new Error("At least one checkout route must remain active.");
      }

      const payload = await apiFetch<SettingsPayload>("/dashboard/settings", {
        method: "PATCH",
        body: JSON.stringify({
          acceptedRoutes,
          defaultRoute: fallbackRoute
        })
      });

      const routeMap = buildRouteMap(payload.acceptedRoutes);
      const persistedDefaultRoute = pickFallbackRoute(payload.supportedRoutes, routeMap, payload.defaultRoute);

      setSettings(payload);
      setSelectedRoutes(routeMap);
      setSelectedDefaultRouteKey(persistedDefaultRoute ? routeKey(persistedDefaultRoute) : "");
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
        body: JSON.stringify({
          amountFiat: previewForm.amountFiat,
          fiatCurrency: previewForm.fiatCurrency,
          description: previewForm.description,
          ...(previewMode === "override"
            ? {
                settlementCurrency: previewForm.settlementCurrency,
                network: previewForm.network
              }
            : {})
        })
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

      <div className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-medium text-white">Accepted checkout routes</p>
                <p className="mt-1 text-sm text-slate-400">
                  Decide which assets and networks appear in hosted checkout for your buyers.
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
                      <p className="text-xs text-slate-500">Only enabled networks are surfaced to the payer.</p>
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

          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-medium text-white">Default payer route</p>
                <p className="mt-1 text-sm text-slate-400">
                  This is the first asset and network the payer sees whenever a checkout is created without an explicit route.
                </p>
              </div>
              <Sparkles className="h-5 w-5 text-cyan-300" />
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {enabledRoutes.map((route) => {
                const active = routeKey(route) === selectedDefaultRouteKey;
                return (
                  <button
                    key={routeKey(route)}
                    type="button"
                    onClick={() => setSelectedDefaultRouteKey(routeKey(route))}
                    className={`rounded-3xl border p-4 text-left transition ${
                      active
                        ? "border-cyan-400/50 bg-cyan-400/10 shadow-glow"
                        : "border-white/8 bg-white/[0.03] hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-medium text-white">{route.asset}</p>
                        <p className="mt-1 text-xs text-slate-400">{route.network}</p>
                      </div>
                      {active ? <Badge>Default</Badge> : <span className="text-xs text-slate-500">Set default</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 rounded-3xl border border-cyan-400/15 bg-cyan-400/5 p-4 text-sm text-slate-200">
              API-created payment intents and payment links can now omit the route fields and fall back to this default,
              while explicit route inputs still override it.
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-medium text-white">Payer preview</p>
                <p className="mt-1 text-sm text-slate-400">
                  Generate a real hosted checkout and inspect the exact page your customer will land on.
                </p>
              </div>
              <Eye className="h-5 w-5 text-cyan-300" />
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPreviewMode("default")}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  previewMode === "default"
                    ? "bg-cyan-400 text-slate-950"
                    : "border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                }`}
              >
                Use merchant default
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode("override")}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  previewMode === "override"
                    ? "bg-cyan-400 text-slate-950"
                    : "border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                }`}
              >
                Override for preview
              </button>
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

              {previewMode === "override" ? (
                <>
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
                </>
              ) : (
                <div className="glass-soft md:col-span-2 rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Active default route</p>
                  <p className="mt-3 text-lg text-white">
                    {activeDefaultRoute ? `${activeDefaultRoute.asset} on ${activeDefaultRoute.network}` : "No route configured"}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    The preview request omits route fields and lets the backend apply your merchant-level default.
                  </p>
                </div>
              )}

              <input
                value={previewForm.description}
                onChange={(event) => setPreviewForm((prev) => ({ ...prev, description: event.target.value }))}
                className="glass-soft md:col-span-2 w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
                placeholder="Preview description"
              />
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={createPreview} disabled={busy === "preview" || previewForm.amountFiat <= 0 || !activeDefaultRoute}>
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
              <Link
                href="/docs"
                className="glass inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10"
              >
                Open developer docs
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-white/10 px-6 py-5">
              <p className="text-lg font-medium text-white">Live checkout canvas</p>
              <p className="text-sm text-slate-400">
                This uses the real `/pay/:id` experience, so the QR, address, timer, and payment status are genuine.
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
