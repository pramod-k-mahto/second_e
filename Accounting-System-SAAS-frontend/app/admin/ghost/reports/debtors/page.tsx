"use client";

import useSWR from "swr";
import { api } from "@/lib/api";
import Link from "next/link";
import { downloadCSV } from "@/lib/exportUtils";

type Debtor = {
    ledger_id: number;
    tenant_name: string;
    balance: number;
    email?: string;
    phone?: string;
};

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function GhostDebtorsReport() {
    const { data: debtors, isLoading } = useSWR<Debtor[]>(
        "/admin/tenants/ghost/reports/debtors",
        fetcher
    );

    const totalOutstanding = debtors?.reduce((sum, d) => sum + d.balance, 0) || 0;

    return (
        <div style={{
            minHeight: "100vh",
            background: "linear-gradient(135deg, #0a0a0f 0%, #0e0e1a 40%, #0a0f1a 100%)",
            color: "#e2e8f0",
            padding: "40px",
            fontFamily: "'Inter', sans-serif"
        }}>
            <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "32px" }}>
                    <Link href="/admin/ghost" style={{ 
                        textDecoration: "none", 
                        color: "#94a3b8", 
                        fontSize: "20px",
                        background: "rgba(255,255,255,0.05)",
                        width: "40px",
                        height: "40px",
                        borderRadius: "10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                    }}>
                        ←
                    </Link>
                    <h1 style={{ fontSize: "24px", fontWeight: 800, margin: 0 }}>Tenant Credit Aging</h1>
                </div>

                {/* Summary Card */}
                <div style={{ 
                    background: "rgba(244,63,94,0.1)", 
                    border: "1px solid rgba(244,63,94,0.2)", 
                    borderRadius: "16px", 
                    padding: "24px", 
                    marginBottom: "24px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                }}>
                    <div>
                        <div style={{ fontSize: "14px", color: "#fb7185", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px" }}>Total Outstanding Platform Credit</div>
                        <div style={{ fontSize: "36px", fontWeight: 900, color: "#fff", marginTop: "4px", display: "flex", alignItems: "center", gap: "20px" }}>
                            Rs. {totalOutstanding.toLocaleString()}
                            <button 
                                onClick={() => {
                                    if (!debtors) return;
                                    downloadCSV(debtors, [
                                        { label: "Tenant Name", key: "tenant_name" },
                                        { label: "Balance", key: "balance" },
                                        { label: "Email", key: "email" },
                                        { label: "Phone", key: "phone" }
                                    ], `tenant-credit-aging-${new Date().toISOString().split('T')[0]}.csv`);
                                }}
                                style={{
                                    fontSize: "14px",
                                    padding: "8px 16px",
                                    borderRadius: "8px",
                                    background: "rgba(255,255,255,0.1)",
                                    border: "1px solid rgba(255,255,255,0.2)",
                                    color: "#fff",
                                    cursor: "pointer",
                                    fontWeight: 600
                                }}
                            >
                                Export CSV
                            </button>
                        </div>
                    </div>
                    <div style={{ fontSize: "48px", opacity: 0.2 }}>📉</div>
                </div>

                {/* Table */}
                <div style={{ 
                    background: "rgba(255,255,255,0.02)", 
                    border: "1px solid rgba(255,255,255,0.08)", 
                    borderRadius: "16px", 
                    overflow: "hidden"
                }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                                <th style={{ padding: "16px", textAlign: "left", fontSize: "12px", color: "#64748b" }}>TENANT NAME / LEDGER</th>
                                <th style={{ padding: "16px", textAlign: "left", fontSize: "12px", color: "#64748b" }}>CONTACT</th>
                                <th style={{ padding: "16px", textAlign: "right", fontSize: "12px", color: "#64748b" }}>OUTSTANDING BALANCE</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={3} style={{ padding: "40px", textAlign: "center", color: "#475569" }}>Loading aging report...</td></tr>
                            ) : !debtors?.length ? (
                                <tr><td colSpan={3} style={{ padding: "40px", textAlign: "center", color: "#475569" }}>All tenant accounts are cleared!</td></tr>
                            ) : (
                                debtors.map((d) => (
                                    <tr key={d.ledger_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                                        <td style={{ padding: "16px" }}>
                                            <div style={{ fontSize: "15px", fontWeight: 600, color: "#fff" }}>{d.tenant_name}</div>
                                            <div style={{ fontSize: "12px", color: "#64748b" }}>#{d.ledger_id}</div>
                                        </td>
                                        <td style={{ padding: "16px" }}>
                                            <div style={{ fontSize: "13px", color: "#94a3b8" }}>{d.email || "No Email"}</div>
                                            <div style={{ fontSize: "13px", color: "#94a3b8" }}>{d.phone || "No Phone"}</div>
                                        </td>
                                        <td style={{ padding: "16px", fontSize: "18px", fontWeight: 800, textAlign: "right", color: "#fb7185" }}>
                                            Rs. {d.balance.toLocaleString()}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
