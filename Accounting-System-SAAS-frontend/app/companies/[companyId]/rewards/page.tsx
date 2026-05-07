"use client";

import { useParams } from "next/navigation";
import { RewardsManagementPanel } from "@/components/rewards/RewardsManagementPanel";

export default function RewardsPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  if (!companyId) return null;
  return <RewardsManagementPanel companyId={companyId} embedded={false} />;
}
