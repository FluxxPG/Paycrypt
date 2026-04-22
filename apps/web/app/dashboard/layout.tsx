import type { ReactNode } from "react";
import { AuthGate } from "../../components/auth-gate";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <AuthGate consoleType="merchant">{children}</AuthGate>;
}
