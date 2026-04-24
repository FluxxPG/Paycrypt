"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, TestTube, Save, Smartphone, Shield, Settings } from "lucide-react";
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

  useEffect(() => {
    fetchSettings();
    fetchProviders();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await apiFetch("/upi/settings");
      setSettings(response as UPIMerchantSettings);
    } catch (error) {
      console.error("Failed to fetch UPI settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProviders = async () => {
    try {
      const response = await apiFetch("/upi/providers");
      setProviders((response as any).providers || []);
    } catch (error) {
      console.error("Failed to fetch UPI providers:", error);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    
    setSaving(true);
    try {
      await apiFetch("/upi/settings", {
        method: "PUT",
        body: JSON.stringify(settings)
      });
      alert("UPI settings saved successfully");
    } catch (error) {
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
          apiKey: providers.find(p => p.providerName === providerName)?.apiKey,
          secretKey: providers.find(p => p.providerName === providerName)?.secretKey
        })
      });
      
      if (response.message) {
        alert(`${providerName} test successful!`);
      } else {
        alert(`${providerName} test failed`);
      }
    } catch (error) {
      alert(`${providerName} test failed`);
    } finally {
      setTesting(null);
    }
  };

  const deleteProvider = async (providerName: UPIProvider) => {
    if (!confirm(`Delete ${providerName} provider?`)) return;
    
    try {
      await apiFetch(`/upi/providers/${providerName}`, {
        method: "DELETE"
      });
      fetchProviders();
    } catch (error) {
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
      fetchProviders();
    } catch (error) {
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
            <p className="text-sm text-slate-300">
              Configure merchant PSP keys, routing, and intent behavior.
            </p>
          </div>
          <span className="rounded-full bg-cyan-400/20 px-3 py-1 text-xs text-cyan-200">Enabled by admin</span>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Plan: {settings?.planCode ?? "starter"} · Provider limit:{" "}
          {settings?.upiProviderLimit === -1 ? "Unlimited" : settings?.upiProviderLimit ?? 0}
        </p>
      </Card>

      {settings?.upiEntitled && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            <Settings className="inline mr-2 h-5 w-5" />
            Auto Routing Settings
          </h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">Auto Routing</p>
                <p className="text-sm text-slate-300">Automatically route to best provider</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings?.autoRoutingEnabled || false}
                  onChange={(e) => setSettings({
                    ...settings!,
                    autoRoutingEnabled: e.target.checked
                  })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-400"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">Fallback to Manual</p>
                <p className="text-sm text-slate-300">Use manual UPI if providers fail</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings?.fallbackToManual || false}
                  onChange={(e) => setSettings({
                    ...settings!,
                    fallbackToManual: e.target.checked
                  })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-400"></div>
              </label>
            </div>

            {settings?.autoRoutingEnabled && (
              <div className="mt-4 p-4 glass-soft rounded-xl">
                <p className="text-sm font-medium text-white mb-3">Provider Priority Order</p>
                <div className="space-y-2">
                  {(settings?.allowedProviders?.length ? settings.allowedProviders : providers.map((p) => p.providerName)).map((provider, index) => (
                    <div key={provider} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                      <span className="text-sm text-slate-300 capitalize">{provider}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Priority: {index + 1}</span>
                        <button
                          onClick={() => {
                            // Move provider up in priority
                            const newPriority = { ...settings.providerPriority };
                            const currentPriority = newPriority[provider] || index + 1;
                            if (currentPriority > 1) {
                              newPriority[provider] = currentPriority - 1;
                              setSettings({ ...settings, providerPriority: newPriority });
                            }
                          }}
                          disabled={index === 0}
                          className="text-xs text-cyan-400 disabled:text-slate-600"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => {
                            // Move provider down in priority
                            const newPriority = { ...settings.providerPriority };
                            const currentPriority = newPriority[provider] || index + 1;
                            const maxPriority = Math.max(
                              1,
                              settings?.allowedProviders?.length || providers.length || 1
                            );
                            if (currentPriority < maxPriority) {
                              newPriority[provider] = currentPriority + 1;
                              setSettings({ ...settings, providerPriority: newPriority });
                            }
                          }}
                          disabled={index === ((settings?.allowedProviders?.length || providers.length || 1) - 1)}
                          className="text-xs text-cyan-400 disabled:text-slate-600"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {settings?.upiEntitled && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">
              <Smartphone className="inline mr-2 h-5 w-5" />
              Merchant PSP Providers
            </h3>
            <span className="text-xs text-slate-400">
              Accepted: PhonePe, Paytm, Razorpay, Freecharge
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <select
              value={providerForm.providerName}
              onChange={(event) => setProviderForm((prev) => ({ ...prev, providerName: event.target.value as UPIProvider }))}
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
                setProviderForm((prev) => ({ ...prev, environment: event.target.value as "production" | "test" }))
              }
              className="glass-soft rounded-xl px-4 py-3 text-sm text-slate-100"
            >
              <option value="production">Production</option>
              <option value="test">Test</option>
            </select>
            <input
              value={providerForm.apiKey}
              onChange={(event) => setProviderForm((prev) => ({ ...prev, apiKey: event.target.value }))}
              placeholder="Provider API key"
              className="glass-soft rounded-xl px-4 py-3 text-sm text-slate-100"
            />
            <input
              type="password"
              value={providerForm.secretKey}
              onChange={(event) => setProviderForm((prev) => ({ ...prev, secretKey: event.target.value }))}
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
            <p className="text-slate-300 text-center py-8">
              No PSP configured yet. Add merchant provider credentials to activate UPI intents.
            </p>
          ) : (
            <div className="space-y-3">
              {providers.map((provider) => (
                <div key={provider.providerName} className="glass-soft rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-cyan-400/20 flex items-center justify-center">
                        <Smartphone className="h-5 w-5 text-cyan-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium capitalize">{provider.providerName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={
                            provider.isActive 
                              ? "bg-green-400/20 text-green-400 px-2 py-1 rounded-full text-xs"
                              : "bg-slate-700 text-slate-300 px-2 py-1 rounded-full text-xs"
                          }>
                            {provider.isActive ? "Active" : "Inactive"}
                          </span>
                          <span className={
                            provider.isTested 
                              ? "bg-green-400/20 text-green-400 px-2 py-1 rounded-full text-xs"
                              : "bg-slate-700 text-slate-300 px-2 py-1 rounded-full text-xs"
                          }>
                            {provider.isTested ? "Tested" : "Not Tested"}
                          </span>
                          <span className="bg-slate-700 text-slate-300 px-2 py-1 rounded-full text-xs">
                            {provider.environment}
                          </span>
                          <span className="bg-slate-700 text-slate-300 px-2 py-1 rounded-full text-xs">
                            Priority {provider.priority}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => testProvider(provider.providerName)}
                        disabled={testing === provider.providerName}
                        className="glass-soft"
                      >
                        <TestTube className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => deleteProvider(provider.providerName)}
                        className="glass-soft text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {settings?.upiEntitled && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4">UPI Intent & Manual fallback settings</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">Enable manual mode</p>
                <p className="text-sm text-slate-300">Fallback to merchant VPA + QR when PSPs are unavailable.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings?.manualModeEnabled || false}
                  onChange={(e) => setSettings({ ...settings!, manualModeEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-400"></div>
              </label>
            </div>
            <input
              value={settings?.manualVpa || ""}
              onChange={(e) => setSettings({ ...settings!, manualVpa: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
              placeholder="merchant@upi"
            />
            <input
              value={settings?.manualQrUrl || ""}
              onChange={(e) => setSettings({ ...settings!, manualQrUrl: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
              placeholder="https://.../upi-qr.png (optional)"
            />
          </div>
        </Card>
      )}

      {settings?.upiEntitled && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            <Shield className="inline mr-2 h-5 w-5" />
            Security Settings
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm text-slate-300">Webhook Secret</label>
              <input
                type="password"
                value={settings.webhookSecret || ""}
                onChange={(e) => setSettings({
                  ...settings!,
                  webhookSecret: e.target.value
                })}
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                placeholder="Enter webhook secret for signature verification"
              />
            </div>
          </div>
        </Card>
      )}

      {settings?.upiEntitled && (
        <div className="flex justify-end">
          <Button
            onClick={saveSettings}
            disabled={saving}
            className="bg-cyan-400 text-slate-950"
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      )}
    </div>
  );
};
