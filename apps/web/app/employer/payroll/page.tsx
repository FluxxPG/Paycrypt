"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/authed-fetch";

type PayrollRun = {
  id: string;
  run_number: number;
  period_start: string;
  period_end: string;
  scheduled_pay_date: string;
  total_employees: number;
  total_net_pay: string | number;
  status: string;
  batch_payout_id: string | null;
};

export default function PayrollPage() {
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ data: PayrollRun[] }>("/employer/payroll")
      .then((payload) => setPayrollRuns(payload.data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load payroll"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-cyan-200">Payroll engine</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Payroll runs</h1>
        <p className="mt-2 text-sm text-slate-400">Queued payroll and batch-payout status from the live backend.</p>
      </div>

      {error ? <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div> : null}

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        <table className="w-full">
          <thead className="border-b border-white/10 bg-white/[0.03]">
            <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-400">
              <th className="px-6 py-4">Run</th>
              <th className="px-6 py-4">Period</th>
              <th className="px-6 py-4">Employees</th>
              <th className="px-6 py-4">Net pay</th>
              <th className="px-6 py-4">Batch payout</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {payrollRuns.map((run) => (
              <tr key={run.id} className="text-sm text-slate-300">
                <td className="px-6 py-4 font-medium text-white">#{run.run_number}</td>
                <td className="px-6 py-4">
                  {run.period_start} to {run.period_end}
                  <p className="mt-1 text-xs text-slate-500">Pay date {run.scheduled_pay_date}</p>
                </td>
                <td className="px-6 py-4">{run.total_employees}</td>
                <td className="px-6 py-4">${Number(run.total_net_pay).toLocaleString()}</td>
                <td className="px-6 py-4 font-mono text-xs">{run.batch_payout_id ?? "Not queued"}</td>
                <td className="px-6 py-4">
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs capitalize text-slate-200">
                    {run.status.replace("_", " ")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && payrollRuns.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No payroll runs have been created yet.</div>
        ) : null}
        {loading ? <div className="p-8 text-center text-sm text-slate-500">Loading payroll...</div> : null}
      </div>
    </div>
  );
}
