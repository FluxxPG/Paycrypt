"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/authed-fetch";

type Payslip = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  run_number: number;
  pay_date: string;
  gross_pay: string | number;
  net_pay: string | number;
  currency: string;
  status: string;
  withdrawal_id: string | null;
  document_url: string | null;
};

export default function PayslipsPage() {
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ data: Payslip[] }>("/employer/payslips")
      .then((payload) => setPayslips(payload.data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load payslips"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-cyan-200">Payroll ledger</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Payslips</h1>
        <p className="mt-2 text-sm text-slate-400">Employee payslips linked to queued treasury withdrawals.</p>
      </div>

      {error ? <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div> : null}

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        <table className="w-full">
          <thead className="border-b border-white/10 bg-white/[0.03]">
            <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-400">
              <th className="px-6 py-4">Employee</th>
              <th className="px-6 py-4">Run</th>
              <th className="px-6 py-4">Pay date</th>
              <th className="px-6 py-4">Gross</th>
              <th className="px-6 py-4">Net</th>
              <th className="px-6 py-4">Withdrawal</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {payslips.map((payslip) => (
              <tr key={payslip.id} className="text-sm text-slate-300">
                <td className="px-6 py-4">
                  <p className="font-medium text-white">{[payslip.first_name, payslip.last_name].filter(Boolean).join(" ")}</p>
                  <p className="mt-1 text-xs text-slate-500">{payslip.email}</p>
                </td>
                <td className="px-6 py-4">#{payslip.run_number}</td>
                <td className="px-6 py-4">{payslip.pay_date}</td>
                <td className="px-6 py-4">
                  {payslip.currency} {Number(payslip.gross_pay).toLocaleString()}
                </td>
                <td className="px-6 py-4">
                  {payslip.currency} {Number(payslip.net_pay).toLocaleString()}
                </td>
                <td className="px-6 py-4 font-mono text-xs">{payslip.withdrawal_id ?? "Not processed"}</td>
                <td className="px-6 py-4">
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs capitalize text-slate-200">
                    {payslip.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && payslips.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No payslips exist for this employer yet.</div>
        ) : null}
        {loading ? <div className="p-8 text-center text-sm text-slate-500">Loading payslips...</div> : null}
      </div>
    </div>
  );
}
