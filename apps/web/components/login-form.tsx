"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { setAccessToken } from "../lib/session";

type LoginFormProps = {
  variant?: "merchant" | "admin";
  onSuccessRedirect?: string;
};

export const LoginForm = ({ variant = "merchant", onSuccessRedirect }: LoginFormProps) => {
  const router = useRouter();
  const defaults =
    variant === "admin"
      ? { email: "admin@cryptopay.dev", password: "AdminChangeMe123!" }
      : { email: "owner@nebula.dev", password: "ChangeMe123!" };
  const [email, setEmail] = useState(defaults.email);
  const [password, setPassword] = useState(defaults.password);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Login failed");
      }

      setAccessToken(data.accessToken);
      const role = data.user?.role as string | undefined;
      const redirect =
        onSuccessRedirect ?? (role === "admin" || role === "super_admin" ? "/admin" : "/dashboard");
      router.push(redirect);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-md">
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="mb-2 block text-sm text-slate-300">Email</label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="mb-2 block text-sm text-slate-300">Password</label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        <Button className="w-full" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </Card>
  );
};
