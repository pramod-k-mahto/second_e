"use client";

import { useEffect } from "react";
import TenantImportExportPage from "../page";

export default function TenantLedgerImportExportPage() {
  useEffect(() => {
    const el = document.getElementById("ledger");
    if (el) el.scrollIntoView({ block: "start" });
  }, []);

  return <TenantImportExportPage />;
}
