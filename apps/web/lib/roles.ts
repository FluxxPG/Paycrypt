"use client";

export type AppRole = "merchant" | "admin" | "super_admin";

export const isAdminRole = (role: AppRole | undefined | null) =>
  role === "admin" || role === "super_admin";

export const defaultConsoleForRole = (role: AppRole | undefined | null) =>
  isAdminRole(role) ? "/admin" : "/dashboard";

export const loginPathForConsole = (consoleType: "merchant" | "admin") =>
  consoleType === "admin" ? "/admin/login" : "/login";
