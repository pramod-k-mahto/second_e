"use client";

import { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import Link from "next/link";
import { downloadCSV } from "@/lib/exportUtils";

type SalesInvoice = {
    id: number;
    date: string;
    reference: string;
    tenant_name: string;
    amount: number;
    status: string;
};

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function GhostSalesReport() {
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");

    const { data: invoices, isLoading } = useSWR<SalesInvoice[]>(
        `/admin/tenants/ghost/reports/sales?from_date=${fromDate}&to_date=${toDate}`,
        fetcher
    );

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
                    <h1 style={{ fontSize: "24px", fontWeight: 800, margin: 0 }}>SaaS Sales History</h1>
                </div>

                {/* Filters */}
                <div style={{ 
                    background: "rgba(255,255,255,0.03)", 
                    border: "1px solid rgba(255,255,255,0.08)", 
                    borderRadius: "16px", 
                    padding: "20px", 
                    marginBottom: "24px",
                    display: "flex",
                    gap: "16px",
                    alignItems: "center"
                }}>
                    <div>
                        <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>From Date (AD)</label>
                        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            color: "#fff",
                            outline: "none"
                        }} />
                    </div>
                    <div>
                        <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>To Date (AD)</label>
                        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            color: "#fff",
                            outline: "none"
                        }} />
                    </div>
                    <div style={{ flexGrow: 1 }} />
                    <button 
                        onClick={() => {
                            if (!invoices) return;
                            downloadCSV(invoices, [
                                { label: "Date", key: "date" },
                                { label: "Reference", key: "reference" },
                                { label: "Tenant", key: "tenant_name" },
                                { label: "Amount", key: "amount" },
                                { label: "Status", key: "status" }
                            ], `saas-sales-report-${new Date().toISOString().split('T')[0]}.csv`);
                        }}
                        style={{
                            background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
                            border: "none",
                            borderRadius: "8px",
                            padding: "10px 20px",
                            color: "#fff",
                            cursor: "pointer",
                            fontWeight: 600,
                            marginRight: "10px"
                        }}
                    >
                        Export CSV
                    </button>
                    <button onClick={() => { setFromDate(""); setToDate(""); }} style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "8px",
                        padding: "10px 20px",
                        color: "#94a3b8",
                        cursor: "pointer"
                    }}>Clear</button>
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
                                <th style={{ padding: "16px", textAlign: "left", fontSize: "12px", color: "#64748b" }}>DATE</th>
                                <th style={{ padding: "16px", textAlign: "left", fontSize: "12px", color: "#64748b" }}>REFERENCE</th>
                                <th style={{ padding: "16px", textAlign: "left", fontSize: "12px", color: "#64748b" }}>TENANT</th>
                                <th style={{ padding: "16px", textAlign: "right", fontSize: "12px", color: "#64748b" }}>AMOUNT</th>
                                <th style={{ padding: "16px", textAlign: "center", fontSize: "12px", color: "#64748b" }}>STATUS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "#475569" }}>Loading data...</td></tr>
                            ) : !invoices?.length ? (
                                <tr><td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "#475569" }}>No sales records found</td></tr>
                            ) : (
                                invoices.map((inv) => (
                                    <tr key={inv.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                                        <td style={{ padding: "16px", fontSize: "14px" }}>{inv.date} (AD)</td>
                                        <td style={{ padding: "16px", fontSize: "14px", fontWeight: 600 }}>{inv.reference || `INV-${inv.id}`}</td>
                                        <td style={{ padding: "16px", fontSize: "14px" }}>{inv.tenant_name}</td>
                                        <td style={{ padding: "16px", fontSize: "15px", fontWeight: 700, textAlign: "right", color: "#a78bfa" }}>
                                            Rs. {inv.amount.toLocaleString()}
                                        </td>
                                        <td style={{ padding: "16px", textAlign: "center" }}>
                                            <span style={{ 
                                                padding: "4px 10px", 
                                                borderRadius: "20px", 
                                                fontSize: "11px", 
                                                fontWeight: 700,
                                                background: inv.status === "PAID" ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)",
                                                color: inv.status === "PAID" ? "#34d399" : "#fbbf24"
                                            }}>
                                                {inv.status}
                                            </span>
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
