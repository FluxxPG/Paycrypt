"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/authed-fetch";

type EmployerProfile = {
  company_name: string;
  company_legal_name: string;
  registration_number: string | null;
  tax_id: string | null;
  country: string;
  state_province: string | null;
  city: string;
  address: string;
  postal_code: string;
  contact_email: string;
  contact_phone: string | null;
  status: string;
};

type ChatIntegration = {
  id: string;
  platform: string;
  channel_id: string | null;
  is_active: boolean;
  created_at: string;
};

const emptyProfile = {
  companyName: "",
  companyLegalName: "",
  registrationNumber: "",
  taxId: "",
  country: "",
  stateProvince: "",
  city: "",
  address: "",
  postalCode: "",
  contactEmail: "",
  contactPhone: ""
};

export default function EmployerSettingsPage() {
  const [profile, setProfile] = useState(emptyProfile);
  const [chatIntegrations, setChatIntegrations] = useState<ChatIntegration[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileResult, integrations] = await Promise.allSettled([
        apiFetch<{ data: EmployerProfile }>("/employer/profile"),
        apiFetch<{ data: ChatIntegration[] }>("/employer/integrations/chat")
      ]);

      if (profileResult.status === "fulfilled") {
        const row = profileResult.value.data;
        setProfile({
          companyName: row.company_name ?? "",
          companyLegalName: row.company_legal_name ?? "",
          registrationNumber: row.registration_number ?? "",
          taxId: row.tax_id ?? "",
          country: row.country ?? "",
          stateProvince: row.state_province ?? "",
          city: row.city ?? "",
          address: row.address ?? "",
          postalCode: row.postal_code ?? "",
          contactEmail: row.contact_email ?? "",
          contactPhone: row.contact_phone ?? ""
        });
        setStatus(row.status);
      }

      if (integrations.status === "fulfilled") {
        setChatIntegrations(integrations.value.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load employer settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const saveProfile = async () => {
    setError(null);
    await apiFetch("/employer/profile", {
      method: "POST",
      body: JSON.stringify(profile)
    });
    await loadSettings();
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-cyan-200">Employer control</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Settings</h1>
        <p className="mt-2 text-sm text-slate-400">Company profile and command-channel integrations.</p>
      </div>

      {error ? <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div> : null}

      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Company profile</h2>
            <p className="mt-1 text-sm text-slate-400">{status ? `Current status: ${status}` : "Create the employer profile to unlock payroll."}</p>
          </div>
          <button
            onClick={saveProfile}
            disabled={loading || !profile.companyName || !profile.country || !profile.city || !profile.contactEmail}
            className="rounded-full bg-cyan-300 px-5 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save profile
          </button>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[
            ["companyName", "Company name"],
            ["companyLegalName", "Legal name"],
            ["registrationNumber", "Registration number"],
            ["taxId", "Tax ID"],
            ["country", "Country"],
            ["stateProvince", "State / Province"],
            ["city", "City"],
            ["postalCode", "Postal code"],
            ["contactEmail", "Contact email"],
            ["contactPhone", "Contact phone"],
            ["address", "Address"]
          ].map(([key, label]) => (
            <label key={key} className={key === "address" ? "md:col-span-2" : ""}>
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</span>
              <input
                value={profile[key as keyof typeof profile]}
                onChange={(event) => setProfile((prev) => ({ ...prev, [key]: event.target.value }))}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/50"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <h2 className="text-lg font-semibold text-white">Chat integrations</h2>
        <p className="mt-1 text-sm text-slate-400">Slack/Teams command integrations attached to the employer workspace.</p>
        <div className="mt-5 space-y-3">
          {chatIntegrations.map((integration) => (
            <div key={integration.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div>
                <p className="font-medium capitalize text-white">{integration.platform}</p>
                <p className="mt-1 text-xs text-slate-500">Channel: {integration.channel_id ?? "Not set"}</p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-slate-200">
                {integration.is_active ? "Active" : "Paused"}
              </span>
            </div>
          ))}
          {!loading && chatIntegrations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">
              No chat integrations have been connected yet.
            </div>
          ) : null}
          {loading ? <div className="p-6 text-center text-sm text-slate-500">Loading settings...</div> : null}
        </div>
      </div>
    </div>
  );
}
