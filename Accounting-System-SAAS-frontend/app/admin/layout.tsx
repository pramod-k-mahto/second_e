"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { api, getToken } from "@/lib/api";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  const token = typeof window !== "undefined" ? getToken() : null;
  const { data: currentUser, isLoading } = useSWR(
    token ? "/auth/me" : null,
    (url: string) => api.get(url).then((r) => r.data)
  );

  useEffect(() => {
    if (!token) {
      router.replace("/auth/login");
      return;
    }
    if (isLoading) return;
    const role = String(currentUser?.role || "").toLowerCase();
    const isGhostAdmin = role === "superadmin" || role.startsWith("ghost_");
    if (isGhostAdmin || role === "admin") {
      setAuthorized(true);
    } else {
      router.replace("/companies");
    }
  }, [token, currentUser, isLoading, router]);

  if (!authorized) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#64748b", fontSize: "14px" }}>Verifying access...</div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0a0a0f 0%, #0e0e1a 40%, #0a0f1a 100%)",
        position: "relative",
      }}
    >
      {/* Subtle back button — only shown on non-home pages */}
      {pathname !== "/admin" && (
        <div
          style={{
            position: "absolute",
            top: "16px",
            left: "20px",
            zIndex: 100,
          }}
        >
          <button
            type="button"
            onClick={() => router.back()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "20px",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
              color: "#475569",
              fontSize: "12px",
              cursor: "pointer",
              backdropFilter: "blur(8px)",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
              (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
              (e.currentTarget as HTMLButtonElement).style.color = "#475569";
            }}
          >
            ← Back
          </button>
        </div>
      )}

      {children}
    </div>
  );
}
