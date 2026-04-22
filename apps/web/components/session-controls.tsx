"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { apiFetch } from "../lib/authed-fetch";
import { getApiBaseUrl } from "../lib/runtime-config";
import { clearAccessToken } from "../lib/session";
import { loginPathForConsole } from "../lib/roles";

type MeResponse = {
  user: {
    userId: string;
    merchantId: string;
    role: "merchant" | "admin" | "super_admin";
  };
};

export const SessionControls = () => {
  const router = useRouter();
  const [actor, setActor] = useState<MeResponse["user"] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    apiFetch<MeResponse>("/auth/me")
      .then((payload) => {
        if (mounted) setActor(payload.user);
      })
      .catch(() => {
        if (mounted) setActor(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const logout = async () => {
    setBusy(true);
    try {
      await fetch(`${getApiBaseUrl()}/auth/logout`, {
        method: "POST",
        credentials: "include"
      });
    } finally {
      clearAccessToken();
      const loginPath = actor?.role === "merchant" ? loginPathForConsole("merchant") : loginPathForConsole("admin");
      router.replace(loginPath);
      router.refresh();
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {actor ? <Badge className="capitalize">{actor.role}</Badge> : null}
      {actor ? <span className="text-xs text-slate-500">{actor.merchantId}</span> : null}
      <Button variant="secondary" onClick={logout} disabled={busy}>
        {busy ? "Signing out..." : "Logout"}
      </Button>
    </div>
  );
};
