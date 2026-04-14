"use client";

import { useEffect, useState } from "react";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { apiFetch } from "../lib/authed-fetch";

type Balance = {
  asset: string;
  free: string;
  locked: string;
};

type Deposit = {
  amount: string;
  coin: string;
  address?: string;
  txId?: string;
  status?: number;
};

export const AdminCustodyPanel = () => {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);

  useEffect(() => {
    apiFetch<{ balances: Balance[] }>("/admin/custody")
      .then((payload) => setBalances(payload.balances))
      .catch(() => setBalances([]));
    apiFetch<{ deposits: Deposit[] }>("/admin/custody/deposits")
      .then((payload) => setDeposits(payload.deposits))
      .catch(() => setDeposits([]));
  }, []);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-white">Binance custodial balances</h2>
          <p className="text-sm text-slate-400">Live balances pulled from Binance Spot API.</p>
        </div>
        <Badge>{balances.length} assets</Badge>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {balances.map((balance) => (
          <div key={balance.asset} className="glass-soft rounded-2xl p-4">
            <p className="text-sm text-white">{balance.asset}</p>
            <p className="mt-2 text-xs text-slate-400">Free: {balance.free}</p>
            <p className="mt-1 text-xs text-slate-400">Locked: {balance.locked}</p>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <p className="text-sm text-slate-300">Recent deposits</p>
        <div className="mt-4 space-y-3 text-sm text-slate-300">
          {deposits.slice(0, 8).map((deposit, index) => (
            <div key={`${deposit.txId ?? index}`} className="glass-soft rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
              <p className="text-white">
                {deposit.coin} - {deposit.amount}
              </p>
                  <p className="mt-1 text-xs text-slate-500">{deposit.address ?? "address unavailable"}</p>
                </div>
                <div className="text-xs text-slate-400">{deposit.status ?? "pending"}</div>
              </div>
            </div>
          ))}
          {deposits.length === 0 ? (
            <p className="text-sm text-slate-400">No deposits returned yet.</p>
          ) : null}
        </div>
      </div>
    </Card>
  );
};
