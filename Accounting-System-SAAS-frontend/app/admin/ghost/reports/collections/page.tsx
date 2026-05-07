"use client";

import { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import Link from "next/link";
import { downloadCSV } from "@/lib/exportUtils";

type Collection = {
    id: number;
    date: string;
    voucher_number: string;
    tenant_name: string;
    amount: number;
    payment_mode: string;
    narration: string;
};

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function GhostCollectionsReport() {
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");

    const { data: collections, isLoading } = useSWR<Collection[]>(
        `/admin/tenants/ghost/reports/collections?from_date=${fromDate}&to_date=${toDate}`,
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
                    <h1 style={{ fontSize: "24px", fontWeight: 800, margin: 0 }}>Tenant Collection History</h1>
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
                            if (!collections) return;
                            downloadCSV(collections, [
                                { label: "Date", key: "date" },
                                { label: "Voucher", key: "voucher_number" },
                                { label: "Tenant", key: "tenant_name" },
                                { label: "Mode", key: "payment_mode" },
                                { label: "Amount", key: "amount" }
                            ], `tenant-collections-${new Date().toISOString().split('T')[0]}.csv`);
                        }}
                        style={{
                            background: "linear-gradient(135deg, #10b981, #059669)",
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
                                <th style={{ padding: "16px", textAlign: "left", fontSize: "12px", color: "#64748b" }}>VOUCHER</th>
                                <th style={{ padding: "16px", textAlign: "left", fontSize: "12px", color: "#64748b" }}>TENANT</th>
                                <th style={{ padding: "16px", textAlign: "left", fontSize: "12px", color: "#64748b" }}>MODE</th>
                                <th style={{ padding: "16px", textAlign: "right", fontSize: "12px", color: "#64748b" }}>AMOUNT</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "#475569" }}>Loading collections...</td></tr>
                            ) : !collections?.length ? (
                                <tr><td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "#475569" }}>No payment records found</td></tr>
                            ) : (
                                collections.map((coll) => (
                                    <tr key={coll.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                                        <td style={{ padding: "16px", fontSize: "14px" }}>{coll.date} (AD)</td>
                                        <td style={{ padding: "16px", fontSize: "14px", fontWeight: 600 }}>{coll.voucher_number || `RCPT-${coll.id}`}</td>
                                        <td style={{ padding: "16px", fontSize: "14px" }}>{coll.tenant_name}</td>
                                        <td style={{ padding: "16px", fontSize: "13px" }}>
                                            <span style={{ 
                                                padding: "4px 8px", 
                                                background: "rgba(255,255,255,0.05)", 
                                                borderRadius: "6px",
                                                color: "#94a3b8"
                                            }}>
                                                {coll.payment_mode}
                                            </span>
                                        </td>
                                        <td style={{ padding: "16px", fontSize: "15px", fontWeight: 700, textAlign: "right", color: "#34d399" }}>
                                            Rs. {coll.amount.toLocaleString()}
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
