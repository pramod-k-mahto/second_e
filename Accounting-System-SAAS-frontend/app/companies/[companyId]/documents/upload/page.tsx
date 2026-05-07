"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { getApiErrorMessage, uploadCompanyDocument } from "@/lib/api";

export default function UploadDocumentPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;

  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please choose a file.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const doc = await uploadCompanyDocument(companyId, file);
      router.push(`/companies/${companyId}/documents/list/${doc.id}`);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Upload Document</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Upload invoice, bill, or purchase document (PDF/JPG/PNG) and then process it with AI.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Document File</label>
          <input
            type="file"
            accept=".pdf,image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          {file && (
            <div className="text-xs text-slate-600 dark:text-slate-300">
              Selected: <span className="font-semibold">{file.name}</span>
            </div>
          )}
          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-9 items-center rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting ? "Uploading..." : "Upload & Continue"}
          </button>
          <Link
            href={`/companies/${companyId}/documents/list`}
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Back to List
          </Link>
        </div>
      </form>
    </div>
  );
}
