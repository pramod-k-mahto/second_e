import { ReactNode } from "react";

export const metadata = {
    title: "Ghost Dashboard — Superadmin",
    description: "Superadmin ghost dashboard to manage all tenants",
};

export default function GhostLayout({ children }: { children: ReactNode }) {
    // No extra wrapper — the page itself manages its own full layout
    return <>{children}</>;
}
