"use client";

export function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
}

export function getWsBaseUrl() {
  return process.env.NEXT_PUBLIC_WS_URL ?? getApiBaseUrl() ?? "http://localhost:4001";
}

export function getAppBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_BASE_URL ?? "http://localhost:3003";
}
