"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BriefcaseBusiness,
  FileArchive,
  FileText,
  LayoutDashboard,
  Menu,
  ReceiptText,
  Settings,
  Users
} from "lucide-react";
import { Button } from "./ui/button";

const navItems = [
  { href: "/employer", label: "Overview", icon: LayoutDashboard },
  { href: "/employer/employees", label: "Employees", icon: Users },
  { href: "/employer/contracts", label: "Contracts", icon: FileText },
  { href: "/employer/payroll", label: "Payroll", icon: BriefcaseBusiness },
  { href: "/employer/payslips", label: "Payslips", icon: ReceiptText },
  { href: "/employer/documents", label: "Documents", icon: FileArchive },
  { href: "/employer/settings", label: "Settings", icon: Settings }
];

export function EmployerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_10%,rgba(34,211,238,0.16),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.14),transparent_30%),linear-gradient(180deg,#020617_0%,#07111f_58%,#020617_100%)]" />
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl lg:block">
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-cyan-400 text-sm font-bold text-slate-950">
              PC
            </span>
            <div>
              <p className="text-sm font-semibold text-white">Paycrypt EOR</p>
              <p className="text-xs text-slate-500">Payroll and workforce OS</p>
            </div>
          </Link>

          <nav className="mt-8 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition ${
                    isActive
                      ? "bg-cyan-400 text-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.22)]"
                      : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-100"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 px-5 py-4 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Button variant="secondary" className="lg:hidden">
                  <Menu className="h-4 w-4" />
                </Button>
                <div>
                  <p className="text-sm font-medium text-white">Employer portal</p>
                  <p className="text-xs text-slate-500">Live payroll, contracts, and payout operations</p>
                </div>
              </div>
              <Link className="glass-soft rounded-full px-4 py-2 text-sm text-slate-100" href="/dashboard">
                Merchant dashboard
              </Link>
            </div>
          </header>

          <main className="p-5 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
