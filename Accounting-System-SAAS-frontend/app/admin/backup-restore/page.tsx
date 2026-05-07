"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import {
  downloadCompanyBackup, getApiErrorWithStatus,
  restoreCompanyNew, restoreCompanyOverwrite,
} from "@/lib/adminCompanyBackupRestore";
import {
  G, GhostBg, GhostPageHeader, ANIM_CSS,
} from "@/lib/adminTheme";
import Link from "next/link";

type AdminTenant = { id: number; name: string };
type AdminCompany = { id: number; name: string };

const tenantsFetcher = (url: string) => api.get(url).then((r) => r.data as AdminTenant[]);
const companiesFetcher = (url: string) => api.get(url).then((r) => r.data as AdminCompany[]);

function isValidBackupFile(file: File) {
  const n = file.name.toLowerCase();
  return n.endsWith(".json") || n.endsWith(".xml") || n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv") || n.endsWith(".zip");
}

const BACKUP_TABLES = [
  { value: "company_settings", label: "Company Settings" },
  { value: "ledger_groups", label: "Ledger Groups" },
  { value: "ledgers", label: "Ledgers" },
  { value: "payment_modes", label: "Payment Modes" },
  { value: "customers", label: "Customers" },
  { value: "suppliers", label: "Suppliers" },
  { value: "items", label: "Items" },
  { value: "item_units", label: "Item Units" },
  { value: "warehouses", label: "Warehouses" },
  { value: "vouchers", label: "Vouchers" },
  { value: "purchase_bills", label: "Purchase Invoices" },
  { value: "sales_invoices", label: "Sales Invoices" },
  { value: "sales_returns", label: "Sales Returns" },
  { value: "purchase_returns", label: "Purchase Returns" },
  { value: "stock_transfers", label: "Stock Transfers" },
  { value: "stock_movements", label: "Stock Movements" },
  { value: "stock_ledgers", label: "Stock Ledgers" },
];

const lbl: React.CSSProperties = { color: "#94a3b8", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px", display: "block" };

function FileHint({ file }: { file: File | null }) {
  if (!file) return null;
  const tooLarge = file.size > 50 * 1024 * 1024;
  const invalid = !isValidBackupFile(file);
  return (
    <div style={{ marginTop: "6px", fontSize: "12px" }}>
      <div style={{ color: "#64748b" }}>📎 {file.name} ({(file.size / 1024).toFixed(1)} KB)</div>
      {tooLarge && <div style={{ color: "#fbbf24" }}>⚠️ File is larger than 50MB — backend may reject it</div>}
      {invalid && <div style={{ color: "#f87171" }}>❌ Only .json, .xml, .xlsx, .csv, .zip allowed</div>}
    </div>
  );
}

type ResultEntry = { type: "success" | "error"; msg: string; companyId?: number };

export default function AdminBackupRestorePage() {
  const { showToast } = useToast();

  const { data: tenants, error: tenantsError, isLoading: tenantsLoading } = useSWR<AdminTenant[]>("/admin/tenants", tenantsFetcher);
  const [tenantIdInput, setTenantIdInput] = useState("");
  const tenantId = useMemo(() => { const n = tenantIdInput ? Number(tenantIdInput) : NaN; return Number.isFinite(n) ? n : null; }, [tenantIdInput]);

  const { data: companies, error: companiesError, isLoading: companiesLoading } = useSWR<AdminCompany[]>(
    tenantId ? `/admin/tenants/${tenantId}/companies` : null, companiesFetcher
  );
  const [companyIdInput, setCompanyIdInput] = useState("");
  const companyId = useMemo(() => { const n = companyIdInput ? Number(companyIdInput) : NaN; return Number.isFinite(n) ? n : null; }, [companyIdInput]);

  const [downloading, setDownloading] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<"json" | "xml" | "excel" | "csv">("json");
  const [selectedTables, setSelectedTables] = useState<string[]>([]);

  const [safeFile, setSafeFile] = useState<File | null>(null);
  const [safeRestoring, setSafeRestoring] = useState(false);
  const [overwriteFile, setOverwriteFile] = useState<File | null>(null);
  const [overwriteConfirm, setOverwriteConfirm] = useState(false);
  const [overwriteRestoring, setOverwriteRestoring] = useState(false);

  const [results, setResults] = useState<ResultEntry[]>([]);

  const addResult = (r: ResultEntry) => setResults((prev) => [r, ...prev.slice(0, 9)]);

  const toggleTable = (val: string) => setSelectedTables((prev) => prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val]);

  const handleDownload = async (isSample = false) => {
    if (!tenantId || !companyId) return;
    setDownloading(true);
    try {
      await downloadCompanyBackup(tenantId, companyId, downloadFormat, selectedTables.length > 0 ? selectedTables : undefined, isSample);
      const msg = `${isSample ? "Sample" : "Backup"} (${downloadFormat.toUpperCase()}) downloaded`;
      addResult({ type: "success", msg });
      showToast({ title: isSample ? "Sample" : "Backup", description: msg, variant: "success" });
    } catch (err) {
      const msg = getApiErrorWithStatus(err);
      addResult({ type: "error", msg });
      showToast({ title: "Download failed", description: msg, variant: "error" });
    } finally { setDownloading(false); }
  };

  const handleSafeRestore = async () => {
    if (!tenantId || !safeFile) return;
    if (!isValidBackupFile(safeFile)) { addResult({ type: "error", msg: "Invalid file type" }); return; }
    setSafeRestoring(true);
    try {
      const data = await restoreCompanyNew(tenantId, safeFile);
      addResult({ type: "success", msg: `Restored into new company`, companyId: data.company_id });
      showToast({ title: "Restore", description: `Restored successfully into company #${data.company_id}`, variant: "success" });
    } catch (err) {
      const msg = getApiErrorWithStatus(err);
      addResult({ type: "error", msg });
      showToast({ title: "Restore failed", description: msg, variant: "error" });
    } finally { setSafeRestoring(false); }
  };

  const handleOverwriteRestore = async () => {
    if (!tenantId || !companyId || !overwriteFile || !overwriteConfirm) return;
    if (!isValidBackupFile(overwriteFile)) { addResult({ type: "error", msg: "Invalid file type" }); return; }
    setOverwriteRestoring(true);
    try {
      const data = await restoreCompanyOverwrite(tenantId, companyId, overwriteFile);
      addResult({ type: "success", msg: `Overwrite restore completed`, companyId: data.company_id });
      showToast({ title: "Overwrite restore", description: `Restored company #${data.company_id}`, variant: "success" });
    } catch (err) {
      const msg = getApiErrorWithStatus(err);
      addResult({ type: "error", msg });
      showToast({ title: "Overwrite failed", description: msg, variant: "error" });
    } finally { setOverwriteRestoring(false); }
  };

  const cardStyle: React.CSSProperties = { ...G.card, padding: "24px", marginBottom: "20px" };
  const sectionTitle = (icon: string, text: string, danger?: boolean) => (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
      <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: danger ? "linear-gradient(135deg, #dc2626, #b91c1c)" : "linear-gradient(135deg, #7c3aed, #4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: "15px", color: danger ? "#fca5a5" : "#e2e8f0" }}>{text}</div>
    </div>
  );

  return (
    <div style={G.pageWrap}>
      <style>{ANIM_CSS}</style>
      <GhostBg />
      <div style={G.inner}>
        <GhostPageHeader icon="💾" title="Backup & Restore" subtitle="Download company data backups or restore from a backup file. Use with care.">
          <Link href="/admin/ghost" style={{ ...G.btnGhost, textDecoration: "none", display: "inline-block" }}>← Ghost Dashboard</Link>
        </GhostPageHeader>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          {/* Left column */}
          <div>
            {/* Target selector */}
            <div style={cardStyle}>
              {sectionTitle("🎯", "Target Tenant & Company")}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div>
                  <label style={lbl}>Tenant (dropdown)</label>
                  <select value={tenantIdInput} onChange={(e) => { setTenantIdInput(e.target.value); setCompanyIdInput(""); }} disabled={tenantsLoading} style={{ ...G.selectStyle, width: "100%" }}>
                    <option value="">Select tenant…</option>
                    {(tenants || []).map((t) => <option key={t.id} value={String(t.id)}>{t.name} (#{t.id})</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Tenant ID (manual)</label>
                  <input value={tenantIdInput} onChange={(e) => { setTenantIdInput(e.target.value); setCompanyIdInput(""); }} placeholder="e.g. 1" style={G.inputStyle} inputMode="numeric" />
                </div>
                <div>
                  <label style={lbl}>Company (dropdown)</label>
                  <select value={companyIdInput} onChange={(e) => setCompanyIdInput(e.target.value)} disabled={!tenantId || companiesLoading} style={{ ...G.selectStyle, width: "100%" }}>
                    <option value="">Select company…</option>
                    {(companies || []).map((c) => <option key={c.id} value={String(c.id)}>{c.name} (#{c.id})</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Company ID (manual)</label>
                  <input value={companyIdInput} onChange={(e) => setCompanyIdInput(e.target.value)} placeholder="e.g. 12" disabled={!tenantId} style={{ ...G.inputStyle, opacity: !tenantId ? 0.5 : 1 }} inputMode="numeric" />
                </div>
              </div>
              {tenantId && companyId && (
                <div style={{ marginTop: "12px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: "8px", padding: "8px 12px", fontSize: "12px", color: "#6ee7b7" }}>
                  ✅ Tenant #{tenantId} · Company #{companyId}
                </div>
              )}
            </div>

            {/* Download section */}
            <div style={cardStyle}>
              {sectionTitle("📥", "Download Backup")}
              <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Format</label>
                  <select value={downloadFormat} onChange={(e) => setDownloadFormat(e.target.value as any)} style={{ ...G.selectStyle, width: "100%" }}>
                    <option value="json">JSON (Full fidelity)</option>
                    <option value="xml">XML</option>
                    <option value="excel">Excel (.xlsx)</option>
                    <option value="csv">CSV / ZIP-CSV</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: "14px" }}>
                <label style={lbl}>Selective Tables <span style={{ color: "#475569", fontWeight: 400 }}>(optional — leave empty for all)</span></label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", maxHeight: "200px", overflowY: "auto", padding: "10px", background: "rgba(255,255,255,0.03)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.06)" }}>
                  {BACKUP_TABLES.map((t) => (
                    <label key={t.value} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: selectedTables.includes(t.value) ? "#c4b5fd" : "#64748b", cursor: "pointer", padding: "4px 6px", borderRadius: "6px", background: selectedTables.includes(t.value) ? "rgba(124,58,237,0.15)" : "transparent", transition: "all 0.15s" }}>
                      <input type="checkbox" checked={selectedTables.includes(t.value)} onChange={() => toggleTable(t.value)} style={{ accentColor: "#7c3aed" }} />
                      {t.label}
                    </label>
                  ))}
                </div>
                {selectedTables.length > 0 && (
                  <div style={{ marginTop: "8px", display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                    <span style={{ color: "#c4b5fd" }}>{selectedTables.length} selected</span>
                    <button onClick={() => setSelectedTables([])} style={{ color: "#64748b", background: "none", border: "none", cursor: "pointer", fontSize: "12px" }}>Clear</button>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button onClick={() => handleDownload(true)} disabled={!tenantId || !companyId || downloading} style={{ ...G.btnGhost, opacity: !tenantId || !companyId || downloading ? 0.4 : 1, fontSize: "12px" }} className="g-btn-ghost">
                  📋 Download Sample
                </button>
                <button onClick={() => handleDownload(false)} disabled={!tenantId || !companyId || downloading} style={{ ...G.btnPrimary, opacity: !tenantId || !companyId || downloading ? 0.4 : 1 }}>
                  {downloading ? "Downloading…" : "📥 Download Backup"}
                </button>
              </div>
            </div>
          </div>

          {/* Right column */}
          <div>
            {/* Safe restore */}
            <div style={cardStyle}>
              {sectionTitle("✅", "Safe Restore (New Company)")}
              <div style={{ color: "#64748b", fontSize: "12px", marginBottom: "16px" }}>Recommended. Creates a new company from your backup. Supports JSON, XML, Excel, CSV, ZIP.</div>
              <div style={{ marginBottom: "16px" }}>
                <label style={lbl}>Backup File</label>
                <div style={{ background: "rgba(255,255,255,0.04)", border: "2px dashed rgba(255,255,255,0.12)", borderRadius: "10px", padding: "16px", textAlign: "center" }}>
                  <input type="file" accept=".json,.xml,.xlsx,.xls,.csv,.zip" onChange={(e) => setSafeFile(e.target.files?.[0] || null)} style={{ fontSize: "13px", color: "#94a3b8", width: "100%" }} />
                </div>
                <FileHint file={safeFile} />
              </div>
              <button onClick={handleSafeRestore} disabled={!tenantId || !safeFile || safeRestoring || (safeFile ? !isValidBackupFile(safeFile) : true)} style={{ background: "linear-gradient(135deg, #059669, #10b981)", color: "#fff", padding: "9px 20px", borderRadius: "10px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "13px", boxShadow: "0 4px 15px rgba(16,185,129,0.3)", opacity: !tenantId || !safeFile || safeRestoring ? 0.5 : 1 }}>
                {safeRestoring ? "Restoring…" : "✅ Restore to New Company"}
              </button>
            </div>

            {/* Overwrite restore */}
            <div style={{ ...cardStyle, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.04)" }}>
              {sectionTitle("⚠️", "Overwrite Restore (Danger)", true)}
              <div style={{ color: "#64748b", fontSize: "12px", marginBottom: "16px" }}>⚠️ This will delete and replace all existing company data. A target company ID is required.</div>
              <div style={{ marginBottom: "16px" }}>
                <label style={lbl}>Backup File</label>
                <div style={{ background: "rgba(239,68,68,0.05)", border: "2px dashed rgba(239,68,68,0.2)", borderRadius: "10px", padding: "16px", textAlign: "center" }}>
                  <input type="file" accept=".json,.xml,.xlsx,.xls,.csv,.zip" onChange={(e) => setOverwriteFile(e.target.files?.[0] || null)} style={{ fontSize: "13px", color: "#94a3b8", width: "100%" }} />
                </div>
                <FileHint file={overwriteFile} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", padding: "12px", background: "rgba(239,68,68,0.08)", borderRadius: "10px", border: "1px solid rgba(239,68,68,0.2)" }}>
                <input type="checkbox" checked={overwriteConfirm} onChange={(e) => setOverwriteConfirm(e.target.checked)} id="owConfirm" style={{ width: "16px", height: "16px", accentColor: "#ef4444", cursor: "pointer" }} />
                <label htmlFor="owConfirm" style={{ color: "#fca5a5", fontSize: "12px", cursor: "pointer" }}>I understand this will delete and replace existing company data</label>
              </div>
              <button onClick={handleOverwriteRestore} disabled={!tenantId || !companyId || !overwriteFile || overwriteRestoring || !overwriteConfirm || (overwriteFile ? !isValidBackupFile(overwriteFile) : true)} style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)", color: "#fff", padding: "9px 20px", borderRadius: "10px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "13px", boxShadow: "0 4px 15px rgba(220,38,38,0.3)", opacity: !tenantId || !companyId || !overwriteFile || overwriteRestoring || !overwriteConfirm ? 0.5 : 1 }}>
                {overwriteRestoring ? "Restoring…" : "⚠️ Overwrite Restore"}
              </button>
            </div>
          </div>
        </div>

        {/* Results log */}
        {results.length > 0 && (
          <div style={{ ...G.card, overflow: "hidden", marginTop: "4px" }}>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)", color: "#64748b", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>📋 Operation Results</div>
            {results.map((r, i) => (
              <div key={i} style={{ padding: "12px 18px", borderBottom: i < results.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", display: "flex", gap: "12px", alignItems: "center", animation: "fadeIn 0.3s ease" }}>
                <span>{r.type === "success" ? "✅" : "❌"}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: "13px", color: r.type === "success" ? "#6ee7b7" : "#fca5a5" }}>{r.msg}</span>
                  {r.companyId && <span style={{ marginLeft: "8px", fontFamily: "monospace", fontSize: "12px", color: "#67e8f9" }}>→ Company #{r.companyId}</span>}
                </div>
                <span style={{ fontSize: "11px", color: "#475569", fontFamily: "monospace" }}>{new Date().toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: "24px", textAlign: "center", color: "#334155", fontSize: "12px" }}>💾 Backup & Restore — Superadmin Only · Handle with care</div>
      </div>
    </div>
  );
}
