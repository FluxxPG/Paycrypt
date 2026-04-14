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
  slug: string;
  status: string;
  custodial_enabled: boolean;
  non_custodial_enabled: boolean;
  plan_code: string | null;
  subscription_status: string | null;
};

export const AdminMerchantsPanel = () => {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    planCode: "starter"
  });

  const selectedMerchant = useMemo(
    () => merchants.find((merchant) => merchant.id === selectedMerchantId) ?? null,
    [merchants, selectedMerchantId]
  );

  const loadMerchants = async () => {
    const payload = await apiFetch<{ data: Merchant[] }>("/admin/merchants");
    setMerchants(payload.data);
    setSelectedMerchantId((current) => current || payload.data[0]?.id || "");
  };

  useEffect(() => {
    void loadMerchants();
  }, []);

  const createMerchant = async () => {
    if (!form.name || !form.email) return;
    setBusy(true);
    try {
      const payload = await apiFetch<{ merchant: Merchant; tempPassword: string }>("/admin/merchants", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setCreatedPassword(payload.tempPassword);
      await loadMerchants();
      setForm({ name: "", email: "", planCode: "starter" });
    } finally {
      setBusy(false);
    }
  };

  const updateMerchantStatus = async (merchantId: string, status: string) => {
    setBusy(true);
    try {
      await apiFetch(`/admin/merchants/${merchantId}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      await loadMerchants();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">Create merchant</h2>
            <p className="text-sm text-slate-400">Provision a new merchant and issue their first login.</p>
          </div>
          <Badge>Super Admin</Badge>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-[1.2fr_1.2fr_0.6fr_auto]">
          <Input
            placeholder="Merchant name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <Input
            placeholder="Owner email"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          />
          <select
            value={form.planCode}
            onChange={(event) => setForm((prev) => ({ ...prev, planCode: event.target.value }))}
            className="glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
          >
            {["starter", "business", "premium", "custom"].map((plan) => (
              <option key={plan} value={plan} className="bg-slate-900">
                {plan}
              </option>
            ))}
          </select>
          <Button onClick={createMerchant} disabled={busy}>
            Create
          </Button>
        </div>
        {createdPassword ? (
          <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            Temporary password: <span className="font-semibold">{createdPassword}</span>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-6">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">Merchant directory</h2>
            <Badge>{merchants.length} merchants</Badge>
          </div>
          <div className="mt-4 space-y-3">
            {merchants.map((merchant) => (
              <div key={merchant.id} className="glass-soft rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-white">{merchant.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{merchant.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                    <span className="glass-soft rounded-full px-3 py-1 capitalize">
                      {merchant.plan_code ?? "custom"}
                    </span>
                    <span className="glass-soft rounded-full px-3 py-1">{merchant.status}</span>
                    <span className="glass-soft rounded-full px-3 py-1">
                      NC {merchant.non_custodial_enabled ? "on" : "off"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => setSelectedMerchantId(merchant.id)}>
                      Manage
                    </Button>
                    <Button
                      onClick={() =>
                        updateMerchantStatus(merchant.id, merchant.status === "active" ? "suspended" : "active")
                      }
                      disabled={busy}
                    >
                      {merchant.status === "active" ? "Suspend" : "Activate"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

      </div>
    </div>
  );
};
