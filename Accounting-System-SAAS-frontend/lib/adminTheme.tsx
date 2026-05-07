// Shared superadmin ghost theme constants and components
import React from "react";

export const G = {
    bg: "linear-gradient(135deg, #0a0a0f 0%, #0e0e1a 40%, #0a0f1a 100%)",
    surface: "rgba(255,255,255,0.03)",
    border: "rgba(255,255,255,0.08)",
    text: "#e2e8f0",
    muted: "#64748b",
    faint: "#475569",
    violet: "#7c3aed",
    violetLight: "#c4b5fd",
    cyan: "#06b6d4",
    emerald: "#10b981",
    amber: "#f59e0b",
    red: "#ef4444",

    pageWrap: {
        minHeight: "100vh" as const,
        background: "linear-gradient(135deg, #0a0a0f 0%, #0e0e1a 40%, #0a0f1a 100%)",
        color: "#e2e8f0" as const,
        fontFamily: "'Inter','Segoe UI',system-ui,-apple-system,sans-serif",
        padding: "0",
    } as React.CSSProperties,

    inner: {
        position: "relative" as const,
        zIndex: 1,
        padding: "32px 40px",
        maxWidth: "1400px",
        margin: "0 auto",
    } as React.CSSProperties,

    card: {
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "16px",
    } as React.CSSProperties,

    inputStyle: {
        padding: "9px 14px",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "10px",
        color: "#e2e8f0",
        fontSize: "13px",
        outline: "none",
        width: "100%",
        boxSizing: "border-box" as const,
    } as React.CSSProperties,

    selectStyle: {
        padding: "9px 14px",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "10px",
        color: "#e2e8f0",
        fontSize: "13px",
        outline: "none",
        cursor: "pointer",
    } as React.CSSProperties,

    btnPrimary: {
        padding: "9px 20px",
        borderRadius: "10px",
        background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
        color: "#fff",
        fontSize: "13px",
        fontWeight: 600,
        border: "none",
        cursor: "pointer",
        boxShadow: "0 4px 15px rgba(124,58,237,0.3)",
    } as React.CSSProperties,

    btnGhost: {
        padding: "8px 16px",
        borderRadius: "10px",
        border: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(255,255,255,0.05)",
        color: "#94a3b8",
        fontSize: "13px",
        cursor: "pointer",
    } as React.CSSProperties,

    btnDanger: {
        padding: "8px 16px",
        borderRadius: "10px",
        border: "1px solid rgba(239,68,68,0.3)",
        background: "rgba(239,68,68,0.1)",
        color: "#fca5a5",
        fontSize: "13px",
        cursor: "pointer",
        fontWeight: 600,
    } as React.CSSProperties,

    tableHeader: {
        padding: "12px 16px",
        textAlign: "left" as const,
        color: "#64748b",
        fontSize: "12px",
        fontWeight: 600,
        textTransform: "uppercase" as const,
        letterSpacing: "0.5px",
        whiteSpace: "nowrap" as const,
    } as React.CSSProperties,

    tableCell: {
        padding: "13px 16px",
        color: "#94a3b8",
        fontSize: "13px",
    } as React.CSSProperties,

    gradientTitle: {
        fontSize: "26px",
        fontWeight: 800,
        background: "linear-gradient(135deg, #a78bfa 0%, #06b6d4 50%, #34d399 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        margin: 0,
        letterSpacing: "-0.5px",
    } as React.CSSProperties,
};

export const ANIM_CSS = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .g-row:hover { background: rgba(124,58,237,0.06) !important; }
  .g-btn-ghost:hover { background: rgba(255,255,255,0.1) !important; color: #e2e8f0 !important; }
  .g-btn-action:hover { background: rgba(124,58,237,0.2) !important; border-color: rgba(124,58,237,0.4) !important; color: #c4b5fd !important; }
  .g-btn-danger-sm:hover { background: rgba(239,68,68,0.2) !important; }
  .g-card-hover:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(124,58,237,0.12) !important; border-color: rgba(124,58,237,0.25) !important; }
  select option { background: #1e1e2e; color: #e2e8f0; }
  input::placeholder { color: #475569; }
`;

export function planColor(plan?: string | null) {
    const p = (plan || "").toLowerCase();
    if (p === "enterprise") return { bg: "rgba(124,58,237,0.15)", text: "#c4b5fd", border: "rgba(124,58,237,0.35)" };
    if (p === "premium") return { bg: "rgba(245,158,11,0.15)", text: "#fcd34d", border: "rgba(245,158,11,0.35)" };
    return { bg: "rgba(6,182,212,0.15)", text: "#67e8f9", border: "rgba(6,182,212,0.35)" };
}

export function statusColor(status?: string | null) {
    const s = (status || "unknown").toLowerCase();
    if (s === "active") return { bg: "rgba(16,185,129,0.15)", text: "#6ee7b7", border: "rgba(16,185,129,0.3)" };
    if (s === "suspended") return { bg: "rgba(239,68,68,0.15)", text: "#fca5a5", border: "rgba(239,68,68,0.3)" };
    if (s === "trial") return { bg: "rgba(59,130,246,0.15)", text: "#93c5fd", border: "rgba(59,130,246,0.3)" };
    return { bg: "rgba(100,116,139,0.15)", text: "#94a3b8", border: "rgba(100,116,139,0.3)" };
}

export function roleColor(role?: string | null) {
    const r = (role || "").toLowerCase();
    if (r === "superadmin") return { bg: "rgba(124,58,237,0.15)", text: "#c4b5fd", border: "rgba(124,58,237,0.3)" };
    if (r === "admin") return { bg: "rgba(245,158,11,0.15)", text: "#fcd34d", border: "rgba(245,158,11,0.3)" };
    if (r === "ghost_billing") return { bg: "rgba(245,158,11,0.15)", text: "#fcd34d", border: "rgba(245,158,11,0.35)" };
    if (r === "ghost_support") return { bg: "rgba(16,185,129,0.15)", text: "#6ee7b7", border: "rgba(16,185,129,0.35)" };
    if (r === "ghost_tech") return { bg: "rgba(6,182,212,0.15)", text: "#67e8f9", border: "rgba(6,182,212,0.35)" };
    return { bg: "rgba(100,116,139,0.15)", text: "#94a3b8", border: "rgba(100,116,139,0.3)" };
}

export function GhostBg() {
    return (
        <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
            <div style={{ position: "absolute", top: "-20%", left: "-10%", width: "600px", height: "600px", borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 70%)" }} />
            <div style={{ position: "absolute", top: "40%", right: "-10%", width: "400px", height: "400px", borderRadius: "50%", background: "radial-gradient(circle, rgba(6,182,212,0.07) 0%, transparent 70%)" }} />
            <div style={{ position: "absolute", bottom: "5%", left: "20%", width: "350px", height: "350px", borderRadius: "50%", background: "radial-gradient(circle, rgba(16,185,129,0.05) 0%, transparent 70%)" }} />
        </div>
    );
}

export function GhostPageHeader({ icon, title, subtitle, children }: {
    icon: string; title: string; subtitle: string; children?: React.ReactNode;
}) {
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "32px", flexWrap: "wrap", gap: "16px" }}>
            <div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
                    <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg, #7c3aed, #5b21b6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", boxShadow: "0 0 20px rgba(124,58,237,0.4)", flexShrink: 0 }}>
                        {icon}
                    </div>
                    <h1 style={G.gradientTitle}>{title}</h1>
                </div>
                <p style={{ color: "#64748b", fontSize: "14px", margin: 0 }}>{subtitle}</p>
            </div>
            {children && (
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    {children}
                </div>
            )}
        </div>
    );
}

export function Pill({ children, bg, text, border }: { children: React.ReactNode; bg: string; text: string; border: string }) {
    return (
        <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: bg, color: text, border: `1px solid ${border}`, textTransform: "capitalize" }}>
            {children}
        </span>
    );
}

export function GhostSpinner() {
    return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "80px" }}>
            <div style={{ width: "36px", height: "36px", border: "3px solid rgba(124,58,237,0.3)", borderTop: "3px solid #7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        </div>
    );
}

export function GhostEmpty({ message = "No data found." }: { message?: string }) {
    return (
        <div style={{ textAlign: "center", padding: "60px", color: "#475569" }}>
            <div style={{ fontSize: "36px", marginBottom: "12px" }}>👻</div>
            <div style={{ fontSize: "14px" }}>{message}</div>
        </div>
    );
}
