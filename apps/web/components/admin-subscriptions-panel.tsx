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
  plan_code: string | null;
  subscription_status: string | null;
};

export const AdminSubscriptionsPanel = () => {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>("");
  const [planCode, setPlanCode] = useState<"starter" | "business" | "premium" | "custom">("business");
  const [customMonthlyPriceInr, setCustomMonthlyPriceInr] = useState("0");
  const [customTransactionLimit, setCustomTransactionLimit] = useState("0");
  const [customSetupFeeInr, setCustomSetupFeeInr] = useState("0");
  const [busy, setBusy] = useState(false);

  const selectedMerchant = useMemo(
    () => merchants.find((merchant) => merchant.id === selectedMerchantId) ?? null,
    [merchants, selectedMerchantId]
  );

  useEffect(() => {
    apiFetch<{ data: Merchant[] }>("/admin/merchants").then((payload) => {
      setMerchants(payload.data);
      setSelectedMerchantId((current) => current || payload.data[0]?.id || "");
      if (payload.data[0]?.plan_code) {
        setPlanCode(payload.data[0].plan_code as typeof planCode);
      }
    });
  }, []);

  useEffect(() => {
    if (selectedMerchant?.plan_code) {
      setPlanCode(selectedMerchant.plan_code as typeof planCode);
    }
  }, [selectedMerchant]);

  const updatePlan = async () => {
    if (!selectedMerchant) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/merchants/${selectedMerchant.id}/subscription`, {
        method: "POST",
        body: JSON.stringify({
          planCode,
          monthlyPriceInr: planCode === "custom" ? Number(customMonthlyPriceInr) : undefined,
          transactionLimit: planCode === "custom" ? Number(customTransactionLimit) : undefined,
          setupFeeInr: planCode === "custom" ? Number(customSetupFeeInr) : undefined
        })
      });
      const payload = await apiFetch<{ data: Merchant[] }>("/admin/merchants");
      setMerchants(payload.data);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">Subscription control</h2>
            <p className="text-sm text-slate-400">Upgrade, downgrade, and override pricing per merchant.</p>
          </div>
          <Badge>Super Admin</Badge>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <label className="mb-2 block text-sm text-slate-300">Merchant</label>
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
          </div>
          <div>
            <label className="mb-2 block text-sm text-slate-300">Plan</label>
            <select
              value={planCode}
              onChange={(event) => setPlanCode(event.target.value as typeof planCode)}
              className="glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
            >
              <option value="starter" className="bg-slate-900">
                Starter
              </option>
              <option value="business" className="bg-slate-900">
                Business
              </option>
              <option value="premium" className="bg-slate-900">
                Premium
              </option>
              <option value="custom" className="bg-slate-900">
                Custom
              </option>
            </select>
          </div>
          <div className="flex items-end">
            <Button onClick={updatePlan} disabled={busy}>
              Update plan
            </Button>
          </div>
        </div>
        {planCode === "custom" ? (
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm text-slate-300">Monthly price INR</label>
              <Input value={customMonthlyPriceInr} onChange={(e) => setCustomMonthlyPriceInr(e.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-sm text-slate-300">Transaction limit</label>
              <Input value={customTransactionLimit} onChange={(e) => setCustomTransactionLimit(e.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-sm text-slate-300">Setup fee INR</label>
              <Input value={customSetupFeeInr} onChange={(e) => setCustomSetupFeeInr(e.target.value)} />
            </div>
          </div>
        ) : null}
        {selectedMerchant ? (
          <div className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
            <div className="glass-soft rounded-2xl p-4">Selected: {selectedMerchant.name}</div>
            <div className="glass-soft rounded-2xl p-4">Plan: {selectedMerchant.plan_code ?? "custom"}</div>
            <div className="glass-soft rounded-2xl p-4">
              Status: {selectedMerchant.subscription_status ?? "inactive"}
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
};
