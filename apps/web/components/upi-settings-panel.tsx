"use client";

import { useEffect, useState } from "react";
import { Plus, Save, Settings, Shield, Smartphone, TestTube, Trash2 } from "lucide-react";
import { apiFetch } from "../lib/authed-fetch";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { useRouter } from "next/navigation";

type UPIProvider = "phonepe" | "paytm" | "razorpay" | "freecharge";

type UPIProviderConfig = {
  providerName: UPIProvider;
  apiKey?: string;
  secretKey?: string;
  environment: "production" | "test";
  priority: number;
  isActive: boolean;
  isTested: boolean;
};

type UPIMerchantSettings = {
  upiEnabled: boolean;
  autoRoutingEnabled: boolean;
  fallbackToManual: boolean;
  manualModeEnabled: boolean;
  manualVpa?: string;
  manualQrUrl?: string;
  allowedProviders: UPIProvider[];
  providerPriority: Record<string, number>;
  webhookSecret?: string;
  upiEntitled?: boolean;
  upiProviderLimit?: number;
  planCode?: string;
};

export const UPISettingsPanel = () => {
  const router = useRouter();
  const [settings, setSettings] = useState<UPIMerchantSettings | null>(null);
  const [providers, setProviders] = useState<UPIProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [providerForm, setProviderForm] = useState({
    providerName: "phonepe" as UPIProvider,
    apiKey: "",
    secretKey: "",
    environment: "production" as "production" | "test",
    priority: 1
  });

  const fetchSettings = async () => {
    try {
      const response = await apiFetch("/upi/settings");
      setSettings(response as UPIMerchantSettings);
    } finally {
      setLoading(false);
    }
  };

  const fetchProviders = async () => {
    const response = await apiFetch("/upi/providers");
    setProviders((response as any).providers || []);
  };

  useEffect(() => {
    void Promise.all([fetchSettings(), fetchProviders()]);
  }, []);

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await apiFetch("/upi/settings", {
        method: "PUT",
        body: JSON.stringify(settings)
      });
      alert("UPI settings saved successfully");
    } catch {
      alert("Failed to save UPI settings");
    } finally {
      setSaving(false);
    }
  };

  const testProvider = async (providerName: UPIProvider) => {
    setTesting(providerName);
    try {
      const response = await apiFetch<{ message?: string }>(`/upi/providers/${providerName}/test`, {
        method: "POST",
        body: JSON.stringify({
          apiKey: providers.find((provider) => provider.providerName === providerName)?.apiKey,
          secretKey: providers.find((provider) => provider.providerName === providerName)?.secretKey
        })
      });
      alert(response.message ? `${providerName} test successful` : `${providerName} test failed`);
    } catch {
      alert(`${providerName} test failed`);
    } finally {
      setTesting(null);
    }
  };

  const deleteProvider = async (providerName: UPIProvider) => {
    try {
      await apiFetch(`/upi/providers/${providerName}`, {
        method: "DELETE"
      });
      await fetchProviders();
    } catch {
      alert("Failed to delete provider");
    }
  };

  const addProvider = async (providerName: UPIProvider, config: Partial<UPIProviderConfig>) => {
    try {
      await apiFetch("/upi/providers", {
        method: "POST",
        body: JSON.stringify({
          providerName,
          apiKey: config.apiKey,
          secretKey: config.secretKey,
          environment: config.environment || "test",
          priority: config.priority || 1
        })
      });
      setProviderForm({
        providerName,
        apiKey: "",
        secretKey: "",
        environment: config.environment || "production",
        priority: 1
      });
      await fetchProviders();
    } catch {
      alert("Failed to add provider");
    }
  };

  if (loading) {
    return (
      <Card className="p-8">
        <p className="text-slate-300">Loading UPI settings...</p>
      </Card>
    );
  }

  if (settings && !settings.upiEntitled) {
    router.replace("/dashboard");
    return null;
  }

  const providerLimitReached =
    settings?.upiProviderLimit !== undefined && settings.upiProviderLimit >= 0 && providers.length >= settings.upiProviderLimit;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">UPI Integration</h3>
            <p className="text-sm text-slate-300">Configure merchant PSP keys, routing, and intent behavior.</p>
          </div>
          <span className="rounded-full bg-cyan-400/20 px-3 py-1 text-xs text-cyan-200">Enabled by admin</span>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Plan: {settings?.planCode ?? "free"} - Provider limit:{" "}
          {settings?.upiProviderLimit === -1 ? "Unlimited" : settings?.upiProviderLimit ?? 0}
        </p>
      </Card>

      {settings?.upiEntitled ? (
        <>
          <Card className="p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">
              <Settings className="mr-2 inline h-5 w-5" />
              Auto Routing Settings
            </h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">Auto Routing</p>
                  <p className="text-sm text-slate-300">Automatically route to the best provider</p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={settings.autoRoutingEnabled || false}
                    onChange={(event) => setSettings({ ...settings, autoRoutingEnabled: event.target.checked })}
                    className="peer sr-only"
                  />
                  <div className="h-6 w-11 rounded-full bg-slate-700 peer-checked:bg-cyan-400 peer-checked:after:translate-x-full after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-['']" />
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">Fallback to Manual</p>
                  <p className="text-sm text-slate-300">Use manual UPI if providers fail</p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={settings.fallbackToManual || false}
                    onChange={(event) => setSettings({ ...settings, fallbackToManual: event.target.checked })}
                    className="peer sr-only"
                  />
                  <div className="h-6 w-11 rounded-full bg-slate-700 peer-checked:bg-cyan-400 peer-checked:after:translate-x-full after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-['']" />
                </label>
              </div>

              {settings.autoRoutingEnabled ? (
                <div className="glass-soft rounded-xl p-4">
                  <p className="mb-3 text-sm font-medium text-white">Provider Priority Order</p>
                  <div className="space-y-2">
                    {(settings.allowedProviders?.length ? settings.allowedProviders : providers.map((provider) => provider.providerName)).map(
                      (provider, index) => (
                        <div key={provider} className="flex items-center justify-between rounded-lg bg-white/5 p-2">
                          <span className="text-sm capitalize text-slate-300">{provider}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">Priority: {index + 1}</span>
                            <button
                              onClick={() => {
                                const nextPriority = { ...settings.providerPriority };
                                const currentPriority = nextPriority[provider] || index + 1;
                                if (currentPriority > 1) {
                                  nextPriority[provider] = currentPriority - 1;
                                  setSettings({ ...settings, providerPriority: nextPriority });
                                }
                              }}
                              disabled={index === 0}
                              className="text-xs text-cyan-400 disabled:text-slate-600"
                            >
                              Up
                            </button>
                            <button
                              onClick={() => {
                                const nextPriority = { ...settings.providerPriority };
                                const currentPriority = nextPriority[provider] || index + 1;
                                const maxPriority = Math.max(1, settings.allowedProviders?.length || providers.length || 1);
                                if (currentPriority < maxPriority) {
                                  nextPriority[provider] = currentPriority + 1;
                                  setSettings({ ...settings, providerPriority: nextPriority });
                                }
                              }}
                              disabled={index === (settings.allowedProviders?.length || providers.length || 1) - 1}
                              className="text-xs text-cyan-400 disabled:text-slate-600"
                            >
                              Down
                            </button>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                <Smartphone className="mr-2 inline h-5 w-5" />
                Merchant PSP Providers
              </h3>
              <span className="text-xs text-slate-400">Accepted: PhonePe, Paytm, Razorpay, Freecharge</span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <select
                value={providerForm.providerName}
                onChange={(event) => setProviderForm((current) => ({ ...current, providerName: event.target.value as UPIProvider }))}
                className="glass-soft rounded-xl px-4 py-3 text-sm text-slate-100"
              >
                <option value="phonepe">PhonePe</option>
                <option value="paytm">Paytm</option>
                <option value="razorpay">Razorpay</option>
                <option value="freecharge">Freecharge</option>
              </select>
              <select
                value={providerForm.environment}
                onChange={(event) =>
                  setProviderForm((current) => ({ ...current, environment: event.target.value as "production" | "test" }))
                }
                className="glass-soft rounded-xl px-4 py-3 text-sm text-slate-100"
              >
                <option value="production">Production</option>
                <option value="test">Test</option>
              </select>
              <input
                value={providerForm.apiKey}
                onChange={(event) => setProviderForm((current) => ({ ...current, apiKey: event.target.value }))}
                placeholder="Provider API key"
                className="glass-soft rounded-xl px-4 py-3 text-sm text-slate-100"
              />
              <input
                type="password"
                value={providerForm.secretKey}
                onChange={(event) => setProviderForm((current) => ({ ...current, secretKey: event.target.value }))}
                placeholder="Provider secret key"
                className="glass-soft rounded-xl px-4 py-3 text-sm text-slate-100"
              />
              <Button
                onClick={() =>
                  addProvider(providerForm.providerName, {
                    ...providerForm,
                    priority: Math.max(1, providers.length + 1)
                  })
                }
                disabled={!providerForm.apiKey || !providerForm.secretKey || providerLimitReached}
                className="bg-cyan-400 text-slate-950"
              >
                <Plus className="mr-2 h-4 w-4" />
                {providerLimitReached ? "Provider limit reached" : "Save provider credentials"}
              </Button>
            </div>

            {providers.length === 0 ? (
              <p className="py-8 text-center text-slate-300">
                No PSP configured yet. Add merchant provider credentials to activate UPI intents.
              </p>
            ) : (
              <div className="space-y-3">
                {providers.map((provider) => (
                  <div key={provider.providerName} className="glass-soft rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400/20">
                          <Smartphone className="h-5 w-5 text-cyan-400" />
                        </div>
                        <div>
                          <p className="font-medium capitalize text-white">{provider.providerName}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <span
                              className={
                                provider.isActive
                                  ? "rounded-full bg-green-400/20 px-2 py-1 text-xs text-green-400"
                                  : "rounded-full bg-slate-700 px-2 py-1 text-xs text-slate-300"
                              }
                            >
                              {provider.isActive ? "Active" : "Inactive"}
                            </span>
                            <span
                              className={
                                provider.isTested
                                  ? "rounded-full bg-green-400/20 px-2 py-1 text-xs text-green-400"
                                  : "rounded-full bg-slate-700 px-2 py-1 text-xs text-slate-300"
                              }
                            >
                              {provider.isTested ? "Tested" : "Not Tested"}
                            </span>
                            <span className="rounded-full bg-slate-700 px-2 py-1 text-xs text-slate-300">
                              {provider.environment}
                            </span>
                            <span className="rounded-full bg-slate-700 px-2 py-1 text-xs text-slate-300">
                              Priority {provider.priority}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button onClick={() => testProvider(provider.providerName)} disabled={testing === provider.providerName} className="glass-soft">
                          <TestTube className="h-4 w-4" />
                        </Button>
                        <Button onClick={() => deleteProvider(provider.providerName)} className="glass-soft text-red-400">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">UPI Intent and manual fallback</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">Enable manual mode</p>
                  <p className="text-sm text-slate-300">Fallback to merchant VPA and QR when PSPs are unavailable.</p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={settings.manualModeEnabled || false}
                    onChange={(event) => setSettings({ ...settings, manualModeEnabled: event.target.checked })}
                    className="peer sr-only"
                  />
                  <div className="h-6 w-11 rounded-full bg-slate-700 peer-checked:bg-cyan-400 peer-checked:after:translate-x-full after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-['']" />
                </label>
              </div>
              <input
                value={settings.manualVpa || ""}
                onChange={(event) => setSettings({ ...settings, manualVpa: event.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                placeholder="merchant@upi"
              />
              <input
                value={settings.manualQrUrl || ""}
                onChange={(event) => setSettings({ ...settings, manualQrUrl: event.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                placeholder="https://.../upi-qr.png (optional)"
              />
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">
              <Shield className="mr-2 inline h-5 w-5" />
              Security Settings
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-300">Webhook Secret</label>
                <input
                  type="password"
                  value={settings.webhookSecret || ""}
                  onChange={(event) => setSettings({ ...settings, webhookSecret: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                  placeholder="Enter webhook secret for signature verification"
                />
              </div>
            </div>
          </Card>

          <div className="flex justify-end">
            <Button onClick={saveSettings} disabled={saving} className="bg-cyan-400 text-slate-950">
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
};
