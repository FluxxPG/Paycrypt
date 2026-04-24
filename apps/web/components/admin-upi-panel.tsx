"use client";

import { useEffect, useMemo, useState } from "react";
import { Shield, Users, TrendingUp, AlertTriangle, CheckCircle, RefreshCw, Search } from "lucide-react";
import { apiFetch } from "../lib/authed-fetch";
import { Badge } from "./ui/badge";
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
  plan?: string;
  providerLimit?: number;
};

type UPIProviderStats = {
  providerName: string;
  totalMerchants: number;
  activeMerchants?: number;
  testedMerchants?: number;
  totalTransactions: number;
  successRate: number;
  averageProcessingTime?: number;
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

export const AdminUPIPanel = () => {
  const [globalStats, setGlobalStats] = useState<UPIGlobalStats | null>(null);
  const [merchantStats, setMerchantStats] = useState<UPIMerchantStats[]>([]);
  const [providerStats, setProviderStats] = useState<UPIProviderStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [planFilter, setPlanFilter] = useState<"all" | "starter" | "custom_selective" | "custom_enterprise">("all");
  const [providerLimitDraft, setProviderLimitDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchStats();
  }, []);

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
            averageProcessingTime: Number(provider.averageProcessingTime ?? 0),
            status
          };
        })
      );
      setProviderLimitDraft(
        Object.fromEntries(
          merchants.map((merchant) => [merchant.merchantId, String(merchant.providerLimit ?? 0)])
        )
      );
    } catch (error) {
      console.error("Failed to fetch UPI stats:", error);
      setError(error instanceof Error ? error.message : "Failed to load UPI management data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

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
      fetchStats();
    } catch (error) {
      alert("Failed to approve UPI access");
    }
  };

  const revokeMerchantUPI = async (merchantId: string) => {
    if (!confirm("Revoke UPI access for this merchant?")) return;
    
    try {
      await apiFetch(`/admin/upi/merchants/${merchantId}/approve-upi`, {
        method: "POST",
        body: JSON.stringify({ enabled: false })
      });
      fetchStats();
    } catch (error) {
      alert("Failed to revoke UPI access");
    }
  };

  const upgradeMerchantPlan = async (merchantId: string, newPlan: string) => {
    try {
      await apiFetch(`/admin/upi/merchants/${merchantId}/upgrade-plan`, {
        method: "POST",
        body: JSON.stringify({ plan: newPlan })
      });
      fetchStats();
    } catch (error) {
      alert("Failed to upgrade merchant plan");
    }
  };

  const filteredMerchants = useMemo(() => {
    return merchantStats.filter((merchant) => {
      const matchesSearch =
        !search.trim() ||
        merchant.merchantName.toLowerCase().includes(search.toLowerCase()) ||
        merchant.merchantId.toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "enabled" && merchant.upiEnabled) ||
        (statusFilter === "disabled" && !merchant.upiEnabled);
      const normalizedPlan = (merchant.plan || "starter") as "starter" | "custom_selective" | "custom_enterprise";
      const matchesPlan = planFilter === "all" || normalizedPlan === planFilter;
      return matchesSearch && matchesStatus && matchesPlan;
    });
  }, [merchantStats, search, statusFilter, planFilter]);

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

      {/* Global Statistics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-6">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Users className="h-4 w-4" />
            Total Merchants
          </div>
          <p className="mt-3 text-3xl font-bold text-white">{globalStats?.totalMerchants || 0}</p>
          <p className="mt-1 text-xs text-slate-500">
            {globalStats?.activeProviders || 0} active providers
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <TrendingUp className="h-4 w-4" />
            Total Transactions
          </div>
          <p className="mt-3 text-3xl font-bold text-white">
            {globalStats?.totalTransactions?.toLocaleString() || 0}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {globalStats?.dailyTransactions?.toLocaleString() || 0} today
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <CheckCircle className="h-4 w-4" />
            Success Rate
          </div>
          <p className="mt-3 text-3xl font-bold text-white">
            {globalStats?.successRate?.toFixed(1) || 0}%
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {globalStats?.totalVolume?.toLocaleString() || 0} total volume
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <AlertTriangle className="h-4 w-4" />
            Daily Volume
          </div>
          <p className="mt-3 text-3xl font-bold text-white">
            ₹{globalStats?.dailyVolume?.toLocaleString() || 0}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            UPI transactions
          </p>
        </Card>
      </div>

      {/* Provider Health */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">
            <Shield className="inline mr-2 h-5 w-5" />
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
              <div className="flex items-center justify-between mb-2">
                <p className="text-white font-medium capitalize">{provider.providerName}</p>
                <span 
                  className={
                    provider.status === "healthy" 
                      ? "bg-green-400/20 text-green-400 px-2 py-1 rounded-full text-xs" 
                      : provider.status === "degraded"
                      ? "bg-yellow-400/20 text-yellow-400 px-2 py-1 rounded-full text-xs"
                      : "bg-red-400/20 text-red-400 px-2 py-1 rounded-full text-xs"
                  }
                >
                  {provider.status}
                </span>
              </div>
              <div className="space-y-1 text-sm">
                <p className="text-slate-300">
                  {provider.totalMerchants} merchants ({provider.activeMerchants ?? 0} active)
                </p>
                <p className="text-slate-300">
                  {(provider.totalTransactions ?? 0).toLocaleString()} transactions
                </p>
                <p className="text-slate-300">
                  {(provider.successRate ?? 0).toFixed(1)}% success rate
                </p>
                <p className="text-slate-300">
                  {(provider.testedMerchants ?? 0).toLocaleString()} tested merchants
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Merchant UPI Management */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          <Users className="inline mr-2 h-5 w-5" />
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
            onChange={(event) =>
              setPlanFilter(event.target.value as "all" | "starter" | "custom_selective" | "custom_enterprise")
            }
            className="glass-soft rounded-xl px-3 py-2 text-sm text-slate-100"
          >
            <option value="all">All plans</option>
            <option value="starter">Starter</option>
            <option value="custom_selective">Custom Selective</option>
            <option value="custom_enterprise">Custom Enterprise</option>
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
                    <span className={
                      merchant.upiEnabled 
                        ? "bg-green-400/20 text-green-400 px-2 py-1 rounded-full text-xs"
                        : "bg-slate-700 text-slate-300 px-2 py-1 rounded-full text-xs"
                    }>
                      {merchant.upiEnabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <span className={
                        merchant.plan === "custom_enterprise" 
                          ? "bg-purple-400/20 text-purple-400 px-2 py-1 rounded-full text-xs"
                          : merchant.plan === "custom_selective"
                          ? "bg-blue-400/20 text-blue-400 px-2 py-1 rounded-full text-xs"
                          : "bg-slate-700 text-slate-300 px-2 py-1 rounded-full text-xs"
                      }>
                        {merchant.plan || "Basic"}
                      </span>
                      <select
                        value={merchant.plan || "starter"}
                        onChange={(e) => upgradeMerchantPlan(merchant.merchantId, e.target.value)}
                        className="text-xs bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-300"
                      >
                        <option value="starter">Starter</option>
                        <option value="custom_selective">Custom Selective</option>
                        <option value="custom_enterprise">Custom Enterprise</option>
                      </select>
                    </div>
                  </td>
                  <td className="py-3 text-slate-300">
                    {merchant.activeProviders}
                  </td>
                  <td className="py-3 text-slate-300">
                    {merchant.totalTransactions?.toLocaleString()}
                  </td>
                  <td className="py-3 text-slate-300">
                    {merchant.successRate?.toFixed(1)}%
                  </td>
                  <td className="py-3 text-slate-300">
                    ₹{merchant.totalVolume?.toLocaleString()}
                  </td>
                  <td className="py-3 text-slate-300">
                    {merchant.lastActivity ? new Date(merchant.lastActivity).toLocaleDateString() : "No activity"}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={providerLimitDraft[merchant.merchantId] ?? String(merchant.providerLimit ?? 0)}
                        onChange={(event) =>
                          setProviderLimitDraft((prev) => ({ ...prev, [merchant.merchantId]: event.target.value }))
                        }
                        placeholder="-1 for unlimited"
                        className="w-28 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
                      />
                      {!merchant.upiEnabled && (
                        <button
                          onClick={() =>
                            approveMerchantUPI(
                              merchant.merchantId,
                              Number(
                                providerLimitDraft[merchant.merchantId] ??
                                  (merchant.plan === "custom_enterprise" ? -1 : 1)
                              )
                            )
                          }
                          className="text-cyan-400 hover:text-cyan-300 text-sm"
                        >
                          Approve UPI
                        </button>
                      )}
                      {merchant.upiEnabled && (
                        <button
                          onClick={() => revokeMerchantUPI(merchant.merchantId)}
                          className="text-red-400 hover:text-red-300 text-sm"
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
