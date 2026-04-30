"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/authed-fetch";

type DocumentRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  document_type: string;
  document_name: string;
  document_url: string;
  status: string;
  expiry_date: string | null;
  created_at: string;
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ data: DocumentRow[] }>("/employer/documents")
      .then((payload) => setDocuments(payload.data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load documents"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-cyan-200">Onboarding evidence</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Documents</h1>
        <p className="mt-2 text-sm text-slate-400">Employee documents and review state from live records.</p>
      </div>

      {error ? <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div> : null}

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        <table className="w-full">
          <thead className="border-b border-white/10 bg-white/[0.03]">
            <tr className="text-left text-xs uppercase tracking-[0.2em] text-slate-400">
              <th className="px-6 py-4">Employee</th>
              <th className="px-6 py-4">Document</th>
              <th className="px-6 py-4">Uploaded</th>
              <th className="px-6 py-4">Expiry</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {documents.map((document) => (
              <tr key={document.id} className="text-sm text-slate-300">
                <td className="px-6 py-4">
                  <p className="font-medium text-white">{[document.first_name, document.last_name].filter(Boolean).join(" ")}</p>
                  <p className="mt-1 text-xs text-slate-500">{document.email}</p>
                </td>
                <td className="px-6 py-4">
                  <a className="text-cyan-200 hover:text-cyan-100" href={document.document_url} target="_blank">
                    {document.document_name}
                  </a>
                  <p className="mt-1 text-xs capitalize text-slate-500">{document.document_type.replace("_", " ")}</p>
                </td>
                <td className="px-6 py-4">{new Date(document.created_at).toLocaleDateString()}</td>
                <td className="px-6 py-4">{document.expiry_date ?? "Not set"}</td>
                <td className="px-6 py-4">
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs capitalize text-slate-200">
                    {document.status.replace("_", " ")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && documents.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No onboarding documents are uploaded yet.</div>
        ) : null}
        {loading ? <div className="p-8 text-center text-sm text-slate-500">Loading documents...</div> : null}
      </div>
    </div>
  );
}
