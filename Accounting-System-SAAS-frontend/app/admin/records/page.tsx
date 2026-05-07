"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { G, GhostBg, GhostPageHeader, GhostSpinner, GhostEmpty, Pill, ANIM_CSS } from "@/lib/adminTheme";

const ALL_FIELDS = [
    { id: "date", label: "Date", reports: ["Sales Register", "Purchase Register"] },
    { id: "due_date", label: "Due Date", reports: ["Sales Register"] },
    { id: "bill_no", label: "Bill No.", reports: ["Sales Register", "Purchase Register"] },
    { id: "custom_reference", label: "Custom Ref.", reports: ["Sales Register"] },
    { id: "customer_name", label: "Customer Name", reports: ["Sales Register"] },
    { id: "supplier_name", label: "Supplier Name", reports: ["Purchase Register"] },
    { id: "item_name", label: "Item Name", reports: ["Sales Register", "Purchase Register"] },
    { id: "warehouse", label: "Warehouse", reports: ["Sales Register", "Purchase Register"] },
    { id: "quantity", label: "Qty", reports: ["Sales Register", "Purchase Register"] },
    { id: "rate", label: "Rate", reports: ["Sales Register", "Purchase Register"] },
    { id: "discount", label: "Discount", reports: ["Sales Register", "Purchase Register"] },
    { id: "tax", label: "Tax %", reports: ["Sales Register", "Purchase Register"] },
    { id: "tax_amount", label: "Tax Amount", reports: ["Sales Register", "Purchase Register"] },
    { id: "amount", label: "Amount", reports: ["Sales Register", "Purchase Register"] },
    { id: "sales_person", label: "Sales Person", reports: ["Sales Register"] },
    { id: "department", label: "Department", reports: ["Sales Register", "Purchase Register"] },
    { id: "project", label: "Project", reports: ["Sales Register", "Purchase Register"] },
    { id: "payment_mode", label: "Payment Mode", reports: ["Sales Register", "Purchase Register"] },
    { id: "narration", label: "Narration", reports: ["Sales Register", "Purchase Register"] },
    { id: "remarks", label: "Remarks", reports: ["Sales Register", "Purchase Register"] }
].map((f, i) => ({ ...f, code: `FLD-${(i + 1).toString().padStart(3, "0")}` }));

export default function RecordsPage() {
    const [q, setQ] = useState("");

    const filtered = useMemo(() => {
        const term = q.toLowerCase();
        return ALL_FIELDS.filter(f =>
            f.id.toLowerCase().includes(term) ||
            f.label.toLowerCase().includes(term) ||
            f.code.toLowerCase().includes(term) ||
            f.reports.some(r => r.toLowerCase().includes(term))
        );
    }, [q]);

    return (
        <div style={G.pageWrap}>
            <style>{ANIM_CSS}</style>
            <GhostBg />
            <div style={G.inner}>
                <GhostPageHeader
                    icon="📑"
                    title="Records & Fields"
                    subtitle="A comprehensive dictionary of system field IDs, labels, and their report mappings for customizations."
                >
                    <Link href="/admin" style={{ ...G.btnGhost, textDecoration: "none", display: "inline-block" }}>← Superadmin</Link>
                </GhostPageHeader>

                <div style={{ ...G.card, padding: "14px 18px", marginBottom: "16px", display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="🔍 Search fields by ID, name, or report..."
                        style={{ ...G.inputStyle, maxWidth: "340px", flex: 1 }}
                    />
                    <span style={{ color: "#64748b", fontSize: "13px", marginLeft: "auto" }}>
                        {filtered.length} matching fields
                    </span>
                </div>

                <div style={{ ...G.card, overflow: "hidden", marginBottom: "24px" }}>
                    {filtered.length === 0 ? (
                        <GhostEmpty message="No fields found matching your search." />
                    ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                            <thead>
                                <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                                    <th style={G.tableHeader}>Code No.</th>
                                    <th style={G.tableHeader}>Field ID (System)</th>
                                    <th style={G.tableHeader}>UI Label</th>
                                    <th style={G.tableHeader}>Used In Reports</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((f, i) => (
                                    <tr key={f.code} style={{ borderBottom: i < filtered.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", transition: "background 0.15s", animation: `fadeIn 0.3s ease ${i * 0.02}s both` }}>
                                        <td style={{ ...G.tableCell, fontFamily: "monospace", color: "#67e8f9" }}>{f.code}</td>
                                        <td style={{ ...G.tableCell, fontWeight: 600, color: "#e2e8f0" }}>{f.id}</td>
                                        <td style={G.tableCell}>{f.label}</td>
                                        <td style={{ ...G.tableCell, display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                            {f.reports.map(r => (
                                                <Pill key={r} bg="rgba(79,70,229,0.15)" border="rgba(79,70,229,0.3)" text="#c4b5fd">{r}</Pill>
                                            ))}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div style={{ marginTop: "24px", textAlign: "center", color: "#334155", fontSize: "12px" }}>
                    📑 Field Dictionary — Superadmin Reference
                </div>
            </div>
        </div>
    );
}
