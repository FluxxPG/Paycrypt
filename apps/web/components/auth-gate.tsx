"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../lib/authed-fetch";
import type { ReactNode } from "react";

export const AuthGate = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    apiFetch("/auth/me")
      .then(() => {
        if (mounted) setReady(true);
      })
      .catch(() => {
        router.replace("/login");
      });
    return () => {
      mounted = false;
    };
  }, [router]);

  if (!ready) {
    return <div className="mx-auto flex min-h-screen max-w-7xl items-center px-6 text-slate-300">Loading session...</div>;
  }

  return <>{children}</>;
};
