"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { api, getApiErrorMessage } from "@/lib/api";
import { G, GhostBg, GhostPageHeader, GhostSpinner, ANIM_CSS } from "@/lib/adminTheme";

type UsageRow = {
  tenant_id: number;
  tenant_name: string;
  document_scan_enabled: boolean;
  daily_document_scan_limit: number | null;
  scans_used_today: number;
  scans_remaining_today: number | null;
};

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function GhostDocumentScanUsagePage() {
  const { data, isLoading, error, mutate } = useSWR<UsageRow[]>(
    "/admin/tenants/ghost/document-scan-usage",
    fetcher
  );
  const [savingTenantId, setSavingTenantId] = useState<number | null>(null);
  const [limitDrafts, setLimitDrafts] = useState<Record<number, string>>({});
  const [enabledDrafts, setEnabledDrafts] = useState<Record<number, boolean>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const rows = data || [];

  const getEnabled = (row: UsageRow) =>
    enabledDrafts[row.tenant_id] ?? Boolean(row.document_scan_enabled);
  const getLimit = (row: UsageRow) =>
    limitDrafts[row.tenant_id] ?? (row.daily_document_scan_limit == null ? "" : String(row.daily_document_scan_limit));

  const savePolicy = async (row: UsageRow) => {
    const enabled = getEnabled(row);
    const limitText = getLimit(row).trim();
    const limit = limitText === "" ? null : Math.max(Number(limitText), 0);
    setSavingTenantId(row.tenant_id);
    setSaveError(null);
    try {
      await api.put(`/admin/tenants/${row.tenant_id}/document-scan-policy`, {
        document_scan_enabled: enabled,
        daily_document_scan_limit: limit,
      });
      await mutate();
    } catch (err) {
      setSaveError(getApiErrorMessage(err));
    } finally {
      setSavingTenantId(null);
    }
  };

  return (
    <div style={G.pageWrap}>
      <style>{ANIM_CSS}</style>
      <GhostBg />
      <div style={{ ...G.inner, maxWidth: "100%" }}>
        <GhostPageHeader
          icon="📄"
          title="Document Scan Usage"
          subtitle="Track daily scan consumption and update per-tenant scan policy."
        >
          <Link href="/admin/ghost" style={{ ...G.btnGhost, textDecoration: "none", display: "inline-block" }}>
            ← Ghost Dashboard
          </Link>
        </GhostPageHeader>

        {saveError && (
          <div style={{ ...G.card, marginBottom: "14px", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5", padding: "12px" }}>
            ⚠️ {saveError}
          </div>
        )}

        <div style={{ ...G.card, overflowX: "auto" }}>
          {isLoading ? (
            <GhostSpinner />
          ) : error ? (
            <div style={{ padding: "16px", color: "#fca5a5" }}>
              {(error as any)?.response?.data?.detail || "Failed to load usage report"}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                  {["Tenant", "Scans Used", "Remaining", "Enabled", "Daily Limit", "Action"].map((h) => (
                    <th key={h} style={{ ...G.tableHeader, padding: "12px 14px" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.tenant_id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ ...G.tableCell, padding: "12px 14px" }}>
                      <div style={{ fontWeight: 700 }}>{row.tenant_name}</div>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>Tenant #{row.tenant_id}</div>
                    </td>
                    <td style={{ ...G.tableCell, padding: "12px 14px", fontWeight: 700 }}>
                      {row.scans_used_today}
                    </td>
                    <td style={{ ...G.tableCell, padding: "12px 14px" }}>
                      {row.scans_remaining_today == null ? "Unlimited" : row.scans_remaining_today}
                    </td>
                    <td style={{ ...G.tableCell, padding: "12px 14px" }}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                        <input
                          type="checkbox"
                          checked={getEnabled(row)}
                          onChange={(e) =>
                            setEnabledDrafts((prev) => ({ ...prev, [row.tenant_id]: e.target.checked }))
                          }
                        />
                        {getEnabled(row) ? "Enabled" : "Disabled"}
                      </label>
                    </td>
                    <td style={{ ...G.tableCell, padding: "12px 14px" }}>
                      <input
                        type="number"
                        min={0}
                        value={getLimit(row)}
                        onChange={(e) =>
                          setLimitDrafts((prev) => ({ ...prev, [row.tenant_id]: e.target.value }))
                        }
                        placeholder="Unlimited"
                        style={{ ...G.inputStyle, width: "120px", padding: "8px 10px" }}
                      />
                    </td>
                    <td style={{ ...G.tableCell, padding: "12px 14px" }}>
                      <button
                        onClick={() => savePolicy(row)}
                        disabled={savingTenantId === row.tenant_id}
                        style={{ ...G.btnPrimary, padding: "8px 12px", fontSize: "12px" }}
                      >
                        {savingTenantId === row.tenant_id ? "Saving..." : "Save"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
