"use client";

import { useEffect } from "react";
import CompanyBackupRestorePage from "../page";

export default function TenantBackupPage() {
  useEffect(() => {
    const el = document.getElementById("backup");
    if (el) el.scrollIntoView({ block: "start" });
  }, []);

  return <CompanyBackupRestorePage />;
}
