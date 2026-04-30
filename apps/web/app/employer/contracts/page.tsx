"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/authed-fetch";

type Contract = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  contract_type: string;
  start_date: string;
  end_date: string | null;
  salary_amount: string | number;
  salary_currency: string;
  salary_frequency: string;
  status: string;
};

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ data: Contract[] }>("/employer/contracts")
      .then((payload) => setContracts(payload.data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load contracts"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-cyan-200">Compliance vault</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Employment contracts</h1>
        <p className="mt-2 text-sm text-slate-400">Signed compensation and employment terms from PostgreSQL.</p>
      </div>

      {error ? <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div> : null}

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        <table className="w-full">
          <thead className="border-b border-white/10 bg-white/[0.03]">
            <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-400">
              <th className="px-6 py-4">Employee</th>
              <th className="px-6 py-4">Type</th>
              <th className="px-6 py-4">Compensation</th>
              <th className="px-6 py-4">Term</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {contracts.map((contract) => (
              <tr key={contract.id} className="text-sm text-slate-300">
                <td className="px-6 py-4">
                  <p className="font-medium text-white">{[contract.first_name, contract.last_name].filter(Boolean).join(" ")}</p>
                  <p className="mt-1 text-xs text-slate-500">{contract.email}</p>
                </td>
                <td className="px-6 py-4 capitalize">{contract.contract_type.replace("_", " ")}</td>
                <td className="px-6 py-4">
                  {contract.salary_currency} {Number(contract.salary_amount).toLocaleString()}
                  <p className="mt-1 text-xs capitalize text-slate-500">{contract.salary_frequency.replace("_", " ")}</p>
                </td>
                <td className="px-6 py-4">
                  {contract.start_date}
                  <p className="mt-1 text-xs text-slate-500">{contract.end_date ? `Ends ${contract.end_date}` : "Open-ended"}</p>
                </td>
                <td className="px-6 py-4">
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs capitalize text-slate-200">
                    {contract.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && contracts.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No employment contracts are active yet.</div>
        ) : null}
        {loading ? <div className="p-8 text-center text-sm text-slate-500">Loading contracts...</div> : null}
      </div>
    </div>
  );
}
