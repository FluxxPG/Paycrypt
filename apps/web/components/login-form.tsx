"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock3, LockKeyhole, RadioTower } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { getApiBaseUrl } from "../lib/runtime-config";
import { clearAccessToken, setAccessToken } from "../lib/session";
import { defaultConsoleForRole, defaultPasswordSetupPathForRole, isAdminRole, type AppRole } from "../lib/roles";

type LoginFormProps = {
  variant?: "merchant" | "admin";
  onSuccessRedirect?: string;
};

export const LoginForm = ({ variant = "merchant", onSuccessRedirect }: LoginFormProps) => {
  const router = useRouter();
  const copy =
    variant === "admin"
      ? {
          badge: "Admin command deck",
          title: "Sign in to the system command layer",
          description: "Manage merchants, subscriptions, custody approvals, and platform-wide operating controls.",
          button: "Open Admin Console",
          highlights: [
            { icon: LockKeyhole, label: "Access governance" },
            { icon: CheckCircle2, label: "Risk and audit controls" },
            { icon: Clock3, label: "Session timeout: 30 min" }
          ]
        }
      : {
          badge: "Merchant access",
          title: "Enter your merchant command center",
          description: "Operate payments, API keys, webhooks, wallets, and transaction analytics from one secure workspace.",
          button: "Enter Merchant Console",
          highlights: [
            { icon: RadioTower, label: "Realtime payment signals" },
            { icon: CheckCircle2, label: "Hosted checkout and links" },
            { icon: Clock3, label: "Session timeout: 30 min" }
          ]
        };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail || !password) {
        throw new Error("Email and password are required");
      }
      const baseUrl = getApiBaseUrl();

      const response = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ email: normalizedEmail, password })
      });

      const raw = await response.text();
      const data = raw ? JSON.parse(raw) : null;

      if (!response.ok) {
        throw new Error(data?.message ?? "Login failed");
      }

      const role = data.user?.role as AppRole | undefined;
      const requiresPasswordSetup = Boolean(data.user?.requiresPasswordSetup);
      const matchesConsole = variant === "admin" ? isAdminRole(role) : role === "merchant";

      if (!matchesConsole) {
        clearAccessToken();
        await fetch(`${baseUrl}/auth/logout`, {
          method: "POST",
          credentials: "include"
        }).catch(() => undefined);
        throw new Error(
          variant === "admin"
            ? "This account belongs to the merchant console. Use merchant login instead."
            : "This account belongs to the admin console. Use admin login instead."
        );
      }

      setAccessToken(data.accessToken);
      const redirect = requiresPasswordSetup
        ? defaultPasswordSetupPathForRole(role)
        : onSuccessRedirect ?? defaultConsoleForRole(role);
      router.push(redirect);
      router.refresh();
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError("Authentication service returned an invalid response. Please retry in a moment.");
      } else {
        setError(err instanceof Error ? err.message : "Login failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-xl overflow-hidden rounded-[32px] border-white/12 bg-slate-950/65 p-0 shadow-[0_30px_90px_rgba(2,6,23,0.55)]">
      <div className="border-b border-white/8 bg-white/[0.03] px-6 py-6 sm:px-7">
        <div className="flex items-center justify-between gap-3">
          <Badge>{copy.badge}</Badge>
          <span className="text-xs uppercase tracking-[0.22em] text-slate-500">Sandbox ready</span>
        </div>
        <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white">{copy.title}</h2>
        <p className="mt-3 max-w-lg text-sm leading-6 text-slate-300">{copy.description}</p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/15 bg-cyan-400/8 px-3 py-1.5 text-xs text-cyan-200">
          <CheckCircle2 className="h-3.5 w-3.5" />
          First-time merchant accounts are routed through password setup before dashboard access.
        </div>
      </div>

      <form className="space-y-5 px-6 py-6 sm:px-7" onSubmit={submit}>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">Email</label>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={variant === "admin" ? "admin@company.com" : "merchant@company.com"}
            className="border-white/10 bg-white/[0.035] py-3.5"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">Password</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            className="border-white/10 bg-white/[0.035] py-3.5"
          />
        </div>
        {error ? (
          <div className="rounded-2xl border border-rose-400/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>
        ) : null}
        <Button className="h-12 w-full rounded-2xl text-sm font-semibold" type="submit" disabled={loading}>
          {loading ? "Signing in..." : copy.button}
        </Button>

        <div className="grid gap-3 rounded-[28px] border border-white/8 bg-white/[0.025] p-4 sm:grid-cols-3">
          {copy.highlights.map((item) => {
            const Icon = item.icon;

            return (
              <div key={item.label} className="rounded-2xl border border-white/8 bg-slate-950/35 p-3">
                <Icon className="h-4 w-4 text-cyan-200" />
                <p className="mt-3 text-xs leading-5 text-slate-300">{item.label}</p>
              </div>
            );
          })}
        </div>
      </form>
    </Card>
  );
};
