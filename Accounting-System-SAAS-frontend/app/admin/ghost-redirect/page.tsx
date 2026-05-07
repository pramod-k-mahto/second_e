"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePermissions } from "@/components/PermissionsContext";
import { useToast } from "@/components/ui/Toast";

export default function GhostRedirectPage() {
  const { ghostCompanyId, loading } = usePermissions();
  const router = useRouter();
  const { showToast } = useToast();

  useEffect(() => {
    if (loading) return;

    if (ghostCompanyId) {
      // Seamlessly redirect to the ghost company switcher
      router.replace(`/companies/${ghostCompanyId}`);
    } else {
      // Fallback to settings with a helpful message
      showToast({
        title: "Configuration Required",
        description: "Please configure your Ghost Company in Admin Settings first.",
        variant: "warning",
      });
      router.replace("/admin/settings");
    }
  }, [ghostCompanyId, loading, router, showToast]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6 animate-pulse">
      <div className="relative">
        <div className="h-16 w-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center text-2xl">
          👻
        </div>
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
          Preparing Platform Bookkeeping
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Switching focus to the platform&apos;s financial registry...
        </p>
      </div>
    </div>
  );
}
