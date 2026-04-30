"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle, RefreshCw, Search, Shield, TrendingUp, Users } from "lucide-react";
import { apiFetch } from "../lib/authed-fetch";
import { Card } from "./ui/card";
import { Button } from "./ui/button";

type UPIMerchantStats = {
  merchantId: string;
  merchantName: string;
  upiEnabled: boolean;
  activeProviders: number;
  totalTransactions: number;
  successRate: number;
  totalVolume: number;
  lastActivity: string;
  plan?: "free" | "premium" | "custom" | string;
  providerLimit?: number;
};

type UPIProviderStats = {
  providerName: string;
  totalMerchants: number;
  activeMerchants?: number;
  testedMerchants?: number;
  totalTransactions?: number;
  successRate: number;
  status: "healthy" | "degraded" | "down";
};

type UPIGlobalStats = {
  totalMerchants: number;
  activeProviders: number;
  totalTransactions: number;
  successRate: number;
  totalVolume: number;
  dailyTransactions: number;
  dailyVolume: number;
};

const planBadgeClass = (plan: string) => {
  if (plan === "custom") return "bg-violet-400/20 text-violet-200";
  if (plan === "premium") return "bg-blue-400/20 text-blue-200";
  return "bg-slate-700 text-slate-200";
};

const providerStatusClass = (status: string) => {
  if (status === "healthy") return "bg-emerald-400/20 text-emerald-200";
  if (status === "degraded") return "bg-amber-400/20 text-amber-100";
  return "bg-rose-400/20 text-rose-200";
};

export const AdminUPIPanel = () => {
  const [globalStats, setGlobalStats] = useState<UPIGlobalStats | null>(null);
  const [merchantStats, setMerchantStats] = useState<UPIMerchantStats[]>([]);
  const [providerStats, setProviderStats] = useState<UPIProviderStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [planFilter, setPlanFilter] = useState<"all" | "free" | "premium" | "custom">("all");
  const [providerLimitDraft, setProviderLimitDraft] = useState<Record<string, string>>({});

  const fetchStats = async () => {
    setError(null);
    try {
      const [globalRes, merchantsRes, providersRes] = await Promise.all([
        apiFetch("/admin/upi/statistics"),
        apiFetch("/admin/upi/merchants"),
        apiFetch("/admin/upi/providers")
      ]);

      const global = globalRes as any;
      const normalizedGlobal: UPIGlobalStats = {
        totalMerchants: Number(global.totalMerchants ?? global.global?.total_merchants ?? 0),
        activeProviders: Number(global.activeProviders ?? global.global?.active_providers ?? 0),
        totalTransactions: Number(global.totalTransactions ?? global.global?.total_upi_transactions ?? 0),
        successRate: Number(global.successRate ?? global.global?.overall_success_rate ?? 0),
        totalVolume: Number(global.totalVolume ?? global.global?.total_volume ?? 0),
        dailyTransactions: Number(global.dailyTransactions ?? 0),
        dailyVolume: Number(global.dailyVolume ?? 0)
      };
      const merchants = ((merchantsRes as any).merchants || []) as UPIMerchantStats[];
      const providers = ((providersRes as any).providers || []) as UPIProviderStats[];

      setGlobalStats(normalizedGlobal);
      setMerchantStats(merchants);
      setProviderStats(
        providers.map((provider: any) => {
          const activeMerchants = Number(provider.activeMerchants ?? provider.totalMerchants ?? 0);
          const successRate = Number(provider.successRate ?? 0);
          const status: "healthy" | "degraded" | "down" =
            activeMerchants === 0 ? "down" : successRate >= 90 ? "healthy" : "degraded";
          return {
            ...provider,
            totalMerchants: Number(provider.totalMerchants ?? 0),
            totalTransactions: Number(provider.totalTransactions ?? 0),
            successRate,
            activeMerchants,
            testedMerchants: Number(provider.testedMerchants ?? 0),
            status
          };
        })
      );
      setProviderLimitDraft(
        Object.fromEntries(merchants.map((merchant) => [merchant.merchantId, String(merchant.providerLimit ?? 0)]))
      );
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load UPI management data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchStats();
  }, []);

  const refreshStats = async () => {
    setRefreshing(true);
    await fetchStats();
  };

  const approveMerchantUPI = async (merchantId: string, providerLimit = 1) => {
    try {
      await apiFetch(`/admin/upi/merchants/${merchantId}/approve-upi`, {
        method: "POST",
        body: JSON.stringify({ enabled: true, providerLimit })
      });
      await fetchStats();
    } catch {
      setError("Failed to approve UPI access");
    }
  };

  const revokeMerchantUPI = async (merchantId: string) => {
    try {
      await apiFetch(`/admin/upi/merchants/${merchantId}/approve-upi`, {
        method: "POST",
        body: JSON.stringify({ enabled: false })
      });
      await fetchStats();
    } catch {
      setError("Failed to revoke UPI access");
    }
  };

  const upgradeMerchantPlan = async (merchantId: string, plan: "free" | "premium" | "custom") => {
    try {
      await apiFetch(`/admin/upi/merchants/${merchantId}/upgrade-plan`, {
        method: "POST",
        body: JSON.stringify({ plan })
      });
      await fetchStats();
    } catch {
      setError("Failed to upgrade merchant plan");
    }
  };

  const filteredMerchants = useMemo(() => {
    return merchantStats.filter((merchant) => {
      const normalizedPlan = (merchant.plan || "free") as "free" | "premium" | "custom";
      const matchesSearch =
        !search.trim() ||
        merchant.merchantName.toLowerCase().includes(search.toLowerCase()) ||
        merchant.merchantId.toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "enabled" && merchant.upiEnabled) ||
        (statusFilter === "disabled" && !merchant.upiEnabled);
      const matchesPlan = planFilter === "all" || normalizedPlan === planFilter;
      return matchesSearch && matchesStatus && matchesPlan;
    });
  }, [merchantStats, planFilter, search, statusFilter]);

  if (loading) {
    return (
      <Card className="p-8">
        <p className="text-slate-300">Loading UPI statistics...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Card className="border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-6">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Users className="h-4 w-4" />
            Total Merchants
          </div>
          <p className="mt-3 text-3xl font-bold text-white">{globalStats?.totalMerchants || 0}</p>
          <p className="mt-1 text-xs text-slate-500">{globalStats?.activeProviders || 0} active providers</p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <TrendingUp className="h-4 w-4" />
            Total Transactions
          </div>
          <p className="mt-3 text-3xl font-bold text-white">
            {globalStats?.totalTransactions?.toLocaleString("en-IN") || 0}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {globalStats?.dailyTransactions?.toLocaleString("en-IN") || 0} today
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <CheckCircle className="h-4 w-4" />
            Success Rate
          </div>
          <p className="mt-3 text-3xl font-bold text-white">{globalStats?.successRate?.toFixed(1) || 0}%</p>
          <p className="mt-1 text-xs text-slate-500">
            INR {globalStats?.totalVolume?.toLocaleString("en-IN") || 0} total volume
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <AlertTriangle className="h-4 w-4" />
            Daily Volume
          </div>
          <p className="mt-3 text-3xl font-bold text-white">
            INR {globalStats?.dailyVolume?.toLocaleString("en-IN") || 0}
          </p>
          <p className="mt-1 text-xs text-slate-500">UPI volume routed today</p>
        </Card>
      </div>

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">
            <Shield className="mr-2 inline h-5 w-5" />
            Provider Health
          </h3>
          <Button className="glass-soft" onClick={refreshStats} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {providerStats.map((provider) => (
            <div key={provider.providerName} className="glass-soft rounded-xl p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-medium capitalize text-white">{provider.providerName}</p>
                <span className={`rounded-full px-2 py-1 text-xs ${providerStatusClass(provider.status)}`}>
                  {provider.status}
                </span>
              </div>
              <div className="space-y-1 text-sm text-slate-300">
                <p>{provider.totalMerchants} merchants ({provider.activeMerchants ?? 0} active)</p>
                <p>{(provider.totalTransactions ?? 0).toLocaleString("en-IN")} transactions</p>
                <p>{(provider.successRate ?? 0).toFixed(1)}% success rate</p>
                <p>{(provider.testedMerchants ?? 0).toLocaleString("en-IN")} tested merchants</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 text-lg font-semibold text-white">
          <Users className="mr-2 inline h-5 w-5" />
          Merchant UPI Access
        </h3>
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <div className="glass-soft flex items-center gap-2 rounded-xl px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search merchant by name or id"
              className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | "enabled" | "disabled")}
            className="glass-soft rounded-xl px-3 py-2 text-sm text-slate-100"
          >
            <option value="all">All statuses</option>
            <option value="enabled">UPI enabled</option>
            <option value="disabled">UPI disabled</option>
          </select>
          <select
            value={planFilter}
            onChange={(event) => setPlanFilter(event.target.value as "all" | "free" | "premium" | "custom")}
            className="glass-soft rounded-xl px-3 py-2 text-sm text-slate-100"
          >
            <option value="all">All plans</option>
            <option value="free">Free</option>
            <option value="premium">Premium</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-slate-300">
                <th className="pb-3">Merchant</th>
                <th className="pb-3">UPI Status</th>
                <th className="pb-3">Plan</th>
                <th className="pb-3">Active Providers</th>
                <th className="pb-3">Transactions</th>
                <th className="pb-3">Success Rate</th>
                <th className="pb-3">Volume</th>
                <th className="pb-3">Last Activity</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMerchants.map((merchant) => (
                <tr key={merchant.merchantId} className="border-t border-slate-700">
                  <td className="py-3 text-white">{merchant.merchantName}</td>
                  <td className="py-3">
                    <span
                      className={
                        merchant.upiEnabled
                          ? "rounded-full bg-green-400/20 px-2 py-1 text-xs text-green-400"
                          : "rounded-full bg-slate-700 px-2 py-1 text-xs text-slate-300"
                      }
                    >
                      {merchant.upiEnabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs capitalize ${planBadgeClass(merchant.plan || "free")}`}>
                        {merchant.plan || "free"}
                      </span>
                      <select
                        value={merchant.plan || "free"}
                        onChange={(event) =>
                          upgradeMerchantPlan(merchant.merchantId, event.target.value as "free" | "premium" | "custom")
                        }
                        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300"
                      >
                        <option value="free">Free</option>
                        <option value="premium">Premium</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                  </td>
                  <td className="py-3 text-slate-300">{merchant.activeProviders}</td>
                  <td className="py-3 text-slate-300">{merchant.totalTransactions?.toLocaleString("en-IN")}</td>
                  <td className="py-3 text-slate-300">{merchant.successRate?.toFixed(1)}%</td>
                  <td className="py-3 text-slate-300">INR {merchant.totalVolume?.toLocaleString("en-IN")}</td>
                  <td className="py-3 text-slate-300">
                    {merchant.lastActivity ? new Date(merchant.lastActivity).toLocaleDateString("en-IN") : "No activity"}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={providerLimitDraft[merchant.merchantId] ?? String(merchant.providerLimit ?? 0)}
                        onChange={(event) =>
                          setProviderLimitDraft((current) => ({ ...current, [merchant.merchantId]: event.target.value }))
                        }
                        placeholder="-1 for unlimited"
                        className="w-28 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
                      />
                      {!merchant.upiEnabled ? (
                        <button
                          onClick={() =>
                            approveMerchantUPI(
                              merchant.merchantId,
                              Number(providerLimitDraft[merchant.merchantId] ?? (merchant.plan === "custom" ? -1 : 1))
                            )
                          }
                          className="text-sm text-cyan-400 hover:text-cyan-300"
                        >
                          Approve UPI
                        </button>
                      ) : (
                        <button
                          onClick={() => revokeMerchantUPI(merchant.merchantId)}
                          className="text-sm text-red-400 hover:text-red-300"
                        >
                          Revoke UPI
                        </button>
                      )}
                      <span className="text-xs text-slate-400">
                        Limit: {merchant.providerLimit === -1 ? "Unlimited" : merchant.providerLimit ?? 0}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredMerchants.length ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-sm text-slate-400">
                    No merchants match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
