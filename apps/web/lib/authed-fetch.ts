"use client";

import { accessTokenKey } from "./session";
import { setAccessToken, clearAccessToken } from "./session";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const request = async (token: string | null) =>
    fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}${path}`, {
      ...init,
      cache: "no-store",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {})
      }
    });

  const tryFetch = async () => {
    const token = typeof window === "undefined" ? null : window.localStorage.getItem(accessTokenKey);
    const response = await request(token);

    if (response.status === 401) {
      const refresh = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include"
      });
      if (refresh.ok) {
        const payload = await refresh.json();
        setAccessToken(payload.accessToken);
        return request(payload.accessToken);
      }
      clearAccessToken();
    }

    return response;
  };

  const response = await tryFetch();
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? `Request failed: ${response.status}`);
  }

  return response.json();
}
