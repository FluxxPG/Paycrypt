"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { apiFetch } from "../lib/authed-fetch";
import { getApiBaseUrl } from "../lib/runtime-config";
import { setAccessToken } from "../lib/session";
import { defaultConsoleForRole, loginPathForConsole, type AppRole } from "../lib/roles";

type PasswordSetupFormProps = {
  consoleType: "merchant" | "admin";
};

export const PasswordSetupForm = ({ consoleType }: PasswordSetupFormProps) => {
  const router = useRouter();
  const [role, setRole] = useState<AppRole | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    apiFetch<{ user?: { role?: AppRole; requiresPasswordSetup?: boolean } }>("/auth/me")
      .then((payload) => {
        const nextRole = payload.user?.role ?? null;
        const requiresPasswordSetup = Boolean(payload.user?.requiresPasswordSetup);
        if (!nextRole) {
          router.replace(loginPathForConsole(consoleType));
          return;
        }
        if (!requiresPasswordSetup) {
          router.replace(defaultConsoleForRole(nextRole));
          return;
        }
        if (mounted) {
          setRole(nextRole);
          setReady(true);
        }
      })
      .catch(() => router.replace(loginPathForConsole(consoleType)));

    return () => {
      mounted = false;
    };
  }, [consoleType, router]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/setup-password`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(typeof window !== "undefined" && window.localStorage.getItem("cryptopay_access_token")
            ? { Authorization: `Bearer ${window.localStorage.getItem("cryptopay_access_token")}` }
            : {})
        },
        body: JSON.stringify({ password, confirmPassword })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "Password setup failed");
      }
      if (payload?.accessToken) {
        setAccessToken(payload.accessToken);
      }
      const nextRole = (payload?.user?.role ?? role) as AppRole | null;
      router.replace(defaultConsoleForRole(nextRole));
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Password setup failed");
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return <div className="mx-auto flex min-h-screen max-w-5xl items-center px-6 text-slate-300">Loading setup...</div>;
  }

  const copy =
    consoleType === "admin"
      ? {
          badge: "Admin password setup",
          title: "Set a new password before opening the admin console.",
          description: "Temporary credentials are one-time only. Create a permanent password to continue."
        }
      : {
          badge: "Merchant password setup",
          title: "Create a permanent password for your merchant workspace.",
          description: "Your temporary password works only for the first sign-in. Replace it now to unlock the dashboard."
        };

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
      <div className="grid w-full gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="flex flex-col justify-center">
          <Badge>{copy.badge}</Badge>
          <h1 className="mt-5 text-5xl font-semibold tracking-tight text-white">{copy.title}</h1>
          <p className="mt-4 max-w-xl text-slate-300">{copy.description}</p>
        </section>
        <Card className="mx-auto w-full max-w-xl overflow-hidden rounded-[32px] border-white/12 bg-slate-950/65 p-0">
          <div className="border-b border-white/8 bg-white/[0.03] px-6 py-6 sm:px-7">
            <h2 className="text-2xl font-semibold text-white">Password setup</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">Use a strong password with at least 10 characters.</p>
          </div>
          <form className="space-y-5 px-6 py-6 sm:px-7" onSubmit={submit}>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">New password</label>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter a new password"
                className="border-white/10 bg-white/[0.035] py-3.5"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">Confirm password</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm the new password"
                className="border-white/10 bg-white/[0.035] py-3.5"
              />
            </div>
            {error ? (
              <div className="rounded-2xl border border-rose-400/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>
            ) : null}
            <Button className="h-12 w-full rounded-2xl text-sm font-semibold" type="submit" disabled={loading}>
              {loading ? "Saving password..." : "Save and continue"}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
};
