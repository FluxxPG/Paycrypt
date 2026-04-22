"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../lib/authed-fetch";
import type { ReactNode } from "react";
import { defaultConsoleForRole, isAdminRole, loginPathForConsole, type AppRole } from "../lib/roles";

type AuthGateProps = {
  children: ReactNode;
  consoleType?: "merchant" | "admin";
};

export const AuthGate = ({ children, consoleType = "merchant" }: AuthGateProps) => {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    apiFetch<{ user?: { role?: AppRole } }>("/auth/me")
      .then((payload) => {
        const role = payload.user?.role;
        const allowed = consoleType === "admin" ? isAdminRole(role) : role === "merchant";

        if (!allowed) {
          router.replace(defaultConsoleForRole(role));
          return;
        }
        if (mounted) setReady(true);
      })
      .catch(() => {
        router.replace(loginPathForConsole(consoleType));
      });
    return () => {
      mounted = false;
    };
  }, [consoleType, router]);

  if (!ready) {
    return <div className="mx-auto flex min-h-screen max-w-7xl items-center px-6 text-slate-300">Loading session...</div>;
  }

  return <>{children}</>;
};
