import { ReactNode } from "react";
import { CartProvider } from "./CartProvider";

export default async function StoreLayout({ children, params }: { children: ReactNode; params: Promise<{ companyId: string }> }) {
    const { companyId } = await params;
    return (
        <CartProvider companyId={companyId}>
            {children}
        </CartProvider>
    );
}
