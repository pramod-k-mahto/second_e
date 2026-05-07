"use client";

import useSWR from "swr";
import { api } from "@/lib/api";
import Link from "next/link";
import { useState, useEffect } from "react";

// Reuse the count up logic for a premium feel
const CountUp = ({ target, duration = 1000, prefix = "" }: { target: number, duration?: number, prefix?: string }) => {
    const [count, setCount] = useState(0);
    useEffect(() => {
        let startTime: number;
        const animate = (time: number) => {
            if (!startTime) startTime = time;
            const progress = Math.min((time - startTime) / duration, 1);
            setCount(Math.floor(progress * target));
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }, [target]);
    return <span>{prefix}{count.toLocaleString()}</span>;
};

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function SmartReportHub() {
    const { data: smartReport, isLoading: smartLoading } = useSWR("/admin/tenants/ghost/smart-report", fetcher);

    const REPORT_CARDS = [
        {
            label: "SaaS Sales History",
            value: smartReport?.total_sales ?? 0,
            desc: "Full overview of platform-wide subscription revenue",
            icon: "💰",
            color: "rgba(139,92,246,0.15)",
            border: "rgba(139,92,246,0.25)",
            textColor: "#a78bfa",
            href: "/admin/ghost/reports/sales"
        },
        {
            label: "Tenant Collections",
            value: smartReport?.total_collections ?? 0,
            desc: "Ledger of all incoming payments & tenant collections",
            icon: "📥",
            color: "rgba(16,185,129,0.15)",
            border: "rgba(16,185,129,0.25)",
            textColor: "#34d399",
            href: "/admin/ghost/reports/collections"
        },
        {
            label: "Platform Credit Aging",
            value: smartReport?.total_outstanding ?? 0,
            desc: "Monitor outstanding credit and tenant aging balances",
            icon: "💳",
            color: "rgba(244,63,94,0.15)",
            border: "rgba(244,63,94,0.25)",
            textColor: "#fb7185",
            href: "/admin/ghost/reports/debtors"
        }
    ];

    return (
        <div style={{
            minHeight: "100vh",
            background: "linear-gradient(135deg, #0a0a0f 0%, #0e0e1a 40%, #0a0f1a 100%)",
            color: "#e2e8f0",
            padding: "40px",
            fontFamily: "'Inter', sans-serif"
        }}>
            <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
                {/* Header */}
                <div style={{ marginBottom: "48px", textAlign: "center" }}>
                    <div style={{ 
                        width: "64px", 
                        height: "64px", 
                        borderRadius: "20px", 
                        background: "linear-gradient(135deg, #7c3aed, #5b21b6)", 
                        display: "flex", 
                        alignItems: "center", 
                        justifyContent: "center", 
                        fontSize: "32px", 
                        boxShadow: "0 0 30px rgba(124,58,237,0.3)",
                        margin: "0 auto 16px"
                    }}>
                        📊
                    </div>
                    <h1 style={{ fontSize: "32px", fontWeight: 900, marginBottom: "8px", background: "linear-gradient(90deg, #fff, #94a3b8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                        Ghost Smart Report
                    </h1>
                    <p style={{ color: "#64748b", margin: 0 }}>Platform-wide financial health & SaaS bookkeeping hub</p>
                </div>

                {/* Tabular Hub Summary */}
                <div style={{ 
                    background: "rgba(255,255,255,0.02)", 
                    border: "1px solid rgba(255,255,255,0.05)", 
                    borderRadius: "24px", 
                    overflow: "hidden",
                    marginBottom: "40px",
                    backdropFilter: "blur(12px)",
                    boxShadow: "0 20px 50px rgba(0,0,0,0.3)"
                }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                                <th style={{ padding: "18px 24px", textAlign: "left", fontSize: "13px", color: "#64748b", fontWeight: 600, letterSpacing: "1px" }}>FINANCIAL CATEGORY</th>
                                <th style={{ padding: "18px 24px", textAlign: "left", fontSize: "13px", color: "#64748b", fontWeight: 600, letterSpacing: "1px" }}>DESCRIPTION</th>
                                <th style={{ padding: "18px 24px", textAlign: "right", fontSize: "13px", color: "#64748b", fontWeight: 600, letterSpacing: "1px" }}>TOTAL AMOUNT</th>
                                <th style={{ padding: "18px 24px", textAlign: "center", fontSize: "13px", color: "#64748b", fontWeight: 600, letterSpacing: "1px" }}>ACTION</th>
                            </tr>
                        </thead>
                        <tbody>
                            {REPORT_CARDS.map((row) => (
                                <tr key={row.label} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)", transition: "all 0.2s" }} className="hover:bg-white/5">
                                    <td style={{ padding: "24px" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                                            <span style={{ fontSize: "28px" }}>{row.icon}</span>
                                            <span style={{ fontSize: "16px", fontWeight: 700, color: "#f1f5f9" }}>{row.label}</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: "24px" }}>
                                        <div style={{ color: "#94a3b8", fontSize: "13px", maxWidth: "300px", lineHeight: 1.5 }}>{row.desc}</div>
                                    </td>
                                    <td style={{ padding: "24px", textAlign: "right" }}>
                                        <div style={{ fontSize: "24px", fontWeight: 900, color: row.textColor }}>
                                            {smartLoading ? "..." : <CountUp target={row.value} prefix="Rs. " />}
                                        </div>
                                    </td>
                                    <td style={{ padding: "24px", textAlign: "center" }}>
                                        <Link 
                                            href={row.href} 
                                            style={{ 
                                                padding: "8px 20px", 
                                                borderRadius: "12px", 
                                                fontSize: "13px", 
                                                fontWeight: 700, 
                                                background: row.textColor + "15", 
                                                color: row.textColor, 
                                                border: `1px solid ${row.textColor}33`,
                                                textDecoration: "none",
                                                display: "inline-block",
                                                transition: "all 0.2s"
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.background = row.textColor + "25"; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.background = row.textColor + "15"; }}
                                        >
                                            Detailed View →
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Quick Stats Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
                     <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "20px", padding: "24px", display: "flex", alignItems: "center", gap: "16px" }}>
                        <div style={{ fontSize: "24px", opacity: 0.5 }}>⚡</div>
                        <div>
                            <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Active SaaS Subscribers</div>
                            <div style={{ fontSize: "20px", fontWeight: 800 }}>{smartReport?.recent_transactions?.length || 0} Recently Active</div>
                        </div>
                     </div>
                     <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "20px", padding: "24px", display: "flex", alignItems: "center", gap: "16px" }}>
                        <div style={{ fontSize: "24px", opacity: 0.5 }}>🔄</div>
                        <div>
                            <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Sync Status</div>
                            <div style={{ fontSize: "20px", fontWeight: 800, color: "#34d399" }}>Live Real-time</div>
                        </div>
                     </div>
                </div>

                <div style={{ marginTop: "60px", textAlign: "center" }}>
                    <Link href="/admin/ghost" style={{ 
                        color: "#64748b", 
                        textDecoration: "none", 
                        fontSize: "14px", 
                        fontWeight: 600,
                        borderBottom: "1px solid rgba(100,116,139,0.3)",
                        paddingBottom: "2px"
                    }}>
                        Back to Ghost Control Center
                    </Link>
                </div>
            </div>
        </div>
    );
}
