"use client";

import { useEffect } from "react";
import TenantImportExportPage from "../page";

export default function TenantOtherImportExportPage() {
  useEffect(() => {
    const el = document.getElementById("other");
    if (el) el.scrollIntoView({ block: "start" });
  }, []);

  return <TenantImportExportPage />;
}
