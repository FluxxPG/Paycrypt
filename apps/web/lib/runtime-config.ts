"use client";

export function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ?? "http://localhost:4000";
}

export function getWsBaseUrl() {
  return process.env.NEXT_PUBLIC_WS_URL?.trim() ?? getApiBaseUrl() ?? "http://localhost:4001";
}

export function getAppBaseUrl() {
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL?.trim();
  if (appBaseUrl) {
    return appBaseUrl;
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return "http://localhost:3003";
}
