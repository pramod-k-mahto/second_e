"use client";

import { useEffect } from "react";
import CompanyBackupRestorePage from "../page";

export default function TenantRestorePage() {
  useEffect(() => {
    const el = document.getElementById("restore");
    if (el) el.scrollIntoView({ block: "start" });
  }, []);

  return <CompanyBackupRestorePage />;
}
