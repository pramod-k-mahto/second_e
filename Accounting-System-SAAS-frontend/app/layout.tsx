import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";

// Avoid Full Route Cache / stale RSC payloads after deploys (single shared UI for all tenants).
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "default-no-store";
import Layout from "@/components/Layout";
import { PermissionsProvider } from "@/components/PermissionsContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ui/Toast";
import ReactQueryProvider from "@/components/ReactQueryProvider";
import { TokenRefreshGuard } from "@/components/TokenRefreshGuard";
import SWRGlobalConfig from "@/components/SWRGlobalConfig";

export const metadata: Metadata = {
  title: "Prixna ERP Pro ",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background-light text-slate-900 dark:bg-background-dark dark:text-slate-100">
        <ThemeProvider>
          <PermissionsProvider>
            <ToastProvider>
              <ReactQueryProvider>
                <SWRGlobalConfig>
                  <TokenRefreshGuard />
                  <Suspense fallback={null}>
                    <Layout>{children}</Layout>
                  </Suspense>
                </SWRGlobalConfig>
              </ReactQueryProvider>
            </ToastProvider>
          </PermissionsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
