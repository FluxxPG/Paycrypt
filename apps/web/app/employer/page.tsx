"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BriefcaseBusiness, FileText, Landmark, Users } from "lucide-react";
import { apiFetch } from "../../lib/authed-fetch";
import { Badge } from "../../components/ui/badge";
import { Card } from "../../components/ui/card";

type EmployerOverview = {
  employer: {
    company_name: string;
    status: string;
    country: string;
  } | null;
  stats: {
    totalEmployees: number;
    activeEmployees: number;
    pendingOnboarding: number;
    totalPayrollRuns: number;
    lastPayrollDate: string | null;
  };
  recentActivity: Array<{
    kind: string;
    title: string;
    subtitle: string;
    occurred_at: string;
  }>;
};

const formatDateTime = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      })
    : "No payroll processed";

const statCards = [
  { key: "totalEmployees", label: "Total employees", icon: Users },
  { key: "activeEmployees", label: "Active employees", icon: BriefcaseBusiness },
  { key: "pendingOnboarding", label: "Pending onboarding", icon: FileText },
  { key: "totalPayrollRuns", label: "Payroll runs", icon: Landmark }
] as const;

export default function EmployerOverviewPage() {
  const [overview, setOverview] = useState<EmployerOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<{ data: EmployerOverview }>("/employer/overview")
      .then((payload) => setOverview(payload.data))
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "Failed to load employer overview")
      );
  }, []);

  if (error) {
    return <Card className="border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</Card>;
  }

  if (!overview) {
    return <Card className="p-6 text-sm text-slate-400">Loading employer treasury and payroll data...</Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge>Payroll OS</Badge>
          <h1 className="mt-4 text-3xl font-semibold text-white">Employer command center</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Manage workforce onboarding, contracts, payroll execution, and crypto payout readiness from live payroll records.
          </p>
        </div>
        <div className="glass-soft rounded-2xl px-4 py-3 text-sm text-slate-300">
          {overview.employer ? (
            <span>
              {overview.employer.company_name} - {overview.employer.country} - {overview.employer.status}
            </span>
          ) : (
            <Link href="/employer/settings" className="text-cyan-200">
              Create employer profile to unlock payroll operations
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {statCards.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.key} className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">{item.label}</p>
                <Icon className="h-5 w-5 text-cyan-300" />
              </div>
              <p className="mt-4 text-3xl text-white">{overview.stats[item.key].toLocaleString("en-IN")}</p>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="p-6">
          <p className="text-lg font-medium text-white">Payroll readiness</p>
          <p className="mt-1 text-sm text-slate-400">
            Live totals from employees, contracts, and payroll runs. No static preview data is used here.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Last payroll activity</p>
              <p className="mt-3 text-sm text-white">{formatDateTime(overview.stats.lastPayrollDate)}</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Onboarding ratio</p>
              <p className="mt-3 text-sm text-white">
                {overview.stats.totalEmployees
                  ? `${Math.round((overview.stats.activeEmployees / overview.stats.totalEmployees) * 100)}% active`
                  : "No employees created"}
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950" href="/employer/employees">
              Add employee
            </Link>
            <Link className="glass-soft rounded-full px-4 py-2 text-sm text-slate-100" href="/employer/payroll">
              Run payroll
            </Link>
            <Link className="glass-soft rounded-full px-4 py-2 text-sm text-slate-100" href="/employer/payslips">
              Review payslips
            </Link>
          </div>
        </Card>

        <Card className="p-6">
          <p className="text-lg font-medium text-white">Recent activity</p>
          <p className="mt-1 text-sm text-slate-400">Latest payroll, employee, and contract events from the database.</p>
          <div className="mt-6 space-y-3">
            {overview.recentActivity.length ? (
              overview.recentActivity.map((entry) => (
                <div key={`${entry.kind}-${entry.occurred_at}-${entry.title}`} className="glass-soft rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Badge>{entry.kind}</Badge>
                      <p className="mt-3 text-sm text-white">{entry.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{entry.subtitle}</p>
                    </div>
                    <p className="whitespace-nowrap text-xs text-slate-400">{formatDateTime(entry.occurred_at)}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-slate-400">
                Activity will appear after employees, contracts, or payroll runs are created.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
