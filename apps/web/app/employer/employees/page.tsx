"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../lib/authed-fetch";

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
  country_of_residence: string | null;
  employment_type: string;
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ data: Employee[] }>("/employer/employees")
      .then((payload) => setEmployees(payload.data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load employees"))
      .finally(() => setLoading(false));
  }, []);

  const filteredEmployees = useMemo(
    () => (filter === "all" ? employees : employees.filter((employee) => employee.status === filter)),
    [employees, filter]
  );

  const statusCount = (status: string) => employees.filter((employee) => employee.status === status).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-200">EOR workforce</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Employees</h1>
          <p className="mt-2 text-sm text-slate-400">Live employee records connected to payroll and contracts.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ["all", `All (${employees.length})`],
          ["active", `Active (${statusCount("active")})`],
          ["pending_onboarding", `Pending (${statusCount("pending_onboarding")})`],
          ["terminated", `Terminated (${statusCount("terminated")})`]
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full border px-4 py-2 text-sm transition ${
              filter === key
                ? "border-cyan-300/60 bg-cyan-300/10 text-cyan-100"
                : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div> : null}

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        <table className="w-full">
          <thead className="border-b border-white/10 bg-white/[0.03]">
            <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-400">
              <th className="px-6 py-4">Name</th>
              <th className="px-6 py-4">Email</th>
              <th className="px-6 py-4">Country</th>
              <th className="px-6 py-4">Type</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {filteredEmployees.map((employee) => (
              <tr key={employee.id} className="text-sm text-slate-300">
                <td className="px-6 py-4 font-medium text-white">
                  {[employee.first_name, employee.last_name].filter(Boolean).join(" ")}
                </td>
                <td className="px-6 py-4">{employee.email}</td>
                <td className="px-6 py-4">{employee.country_of_residence ?? "Not set"}</td>
                <td className="px-6 py-4 capitalize">{employee.employment_type.replace("_", " ")}</td>
                <td className="px-6 py-4">
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs capitalize text-slate-200">
                    {employee.status.replace("_", " ")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filteredEmployees.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No employee records match this filter.</div>
        ) : null}
        {loading ? <div className="p-8 text-center text-sm text-slate-500">Loading employees...</div> : null}
      </div>
    </div>
  );
}
