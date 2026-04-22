"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AuthGate } from "../../components/auth-gate";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/admin/login" || pathname === "/admin/setup-password") {
    return <>{children}</>;
  }

  return <AuthGate consoleType="admin">{children}</AuthGate>;
}
