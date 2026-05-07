"use client";

import { useParams } from "next/navigation";
import { IncentiveDepreciationSetupPanel } from "@/components/settings/IncentiveDepreciationSetupPanel";

export default function SetupPage() {
  const params = useParams();
  const companyId = params?.companyId as string;
  if (!companyId) return null;
  return <IncentiveDepreciationSetupPanel companyId={companyId} variant="standalone" />;
}
