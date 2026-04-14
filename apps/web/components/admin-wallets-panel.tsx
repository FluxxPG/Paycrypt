"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { apiFetch } from "../lib/authed-fetch";

type Merchant = {
  id: string;
  name: string;
  email: string;
  non_custodial_enabled: boolean;
};

type Wallet = {
  id: string;
  wallet_type: string;
  provider: string;
  asset: string;
  network: string;
  address: string;
  is_active: boolean;
  is_selected: boolean;
  payment_count: number;
  confirmed_count: number;
};

export const AdminWalletsPanel = () => {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>("");
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [busy, setBusy] = useState(false);

  const selectedMerchant = useMemo(
    () => merchants.find((merchant) => merchant.id === selectedMerchantId) ?? null,
    [merchants, selectedMerchantId]
  );

  useEffect(() => {
    apiFetch<{ data: Merchant[] }>("/admin/merchants").then((payload) => {
      setMerchants(payload.data);
      setSelectedMerchantId((current) => current || payload.data[0]?.id || "");
    });
  }, []);

  useEffect(() => {
    if (!selectedMerchantId) return;
    apiFetch<{ data: Wallet[] }>(`/admin/merchants/${selectedMerchantId}/wallets`).then((payload) => {
      setWallets(payload.data);
    });
  }, [selectedMerchantId]);

  const toggleNonCustodial = async (enabled: boolean) => {
    if (!selectedMerchant) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/merchants/${selectedMerchant.id}/non-custodial`, {
        method: "POST",
        body: JSON.stringify({ enabled })
      });
      const refresh = await apiFetch<{ data: Merchant[] }>("/admin/merchants");
      setMerchants(refresh.data);
    } finally {
      setBusy(false);
    }
  };

  const toggleWallet = async (walletId: string, patch: { isActive?: boolean; isSelected?: boolean }) => {
    setBusy(true);
    try {
      await apiFetch(`/admin/wallets/${walletId}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      if (selectedMerchantId) {
        const payload = await apiFetch<{ data: Wallet[] }>(`/admin/merchants/${selectedMerchantId}/wallets`);
        setWallets(payload.data);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">Wallet entitlement</h2>
            <p className="text-sm text-slate-400">Approve non-custodial access per merchant.</p>
          </div>
          <Badge>{selectedMerchant?.name ?? "Select merchant"}</Badge>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <select
            value={selectedMerchantId}
            onChange={(event) => setSelectedMerchantId(event.target.value)}
            className="glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none md:max-w-sm"
          >
            {merchants.map((merchant) => (
              <option key={merchant.id} value={merchant.id} className="bg-slate-900">
                {merchant.name}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            onClick={() => toggleNonCustodial(!selectedMerchant?.non_custodial_enabled)}
            disabled={!selectedMerchant || busy}
          >
            {selectedMerchant?.non_custodial_enabled ? "Disable non-custodial" : "Enable non-custodial"}
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">Wallet inventory</h2>
            <p className="text-sm text-slate-400">Enable, disable, and select routes for payout.</p>
          </div>
          <Badge>{wallets.length}</Badge>
        </div>
        <div className="mt-4 space-y-3">
          {wallets.map((wallet) => (
            <div key={wallet.id} className="glass-soft rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-white">
                    {wallet.asset} • {wallet.network}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{wallet.address}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                  <span className="glass-soft rounded-full px-3 py-1">{wallet.wallet_type}</span>
                  <span className="glass-soft rounded-full px-3 py-1">{wallet.provider}</span>
                  <span className="glass-soft rounded-full px-3 py-1">
                    {wallet.confirmed_count}/{wallet.payment_count} confirmed
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => toggleWallet(wallet.id, { isActive: !wallet.is_active })}
                    disabled={busy}
                  >
                    {wallet.is_active ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    onClick={() => toggleWallet(wallet.id, { isSelected: true })}
                    disabled={busy || wallet.is_selected}
                  >
                    {wallet.is_selected ? "Selected" : "Set Primary"}
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {wallets.length === 0 ? (
            <p className="text-sm text-slate-400">No wallets yet. Create a payment to generate wallet routes.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
};
