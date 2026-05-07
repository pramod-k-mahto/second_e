"use client";

import { useParams } from "next/navigation";
import { BOMManagementPage } from "@/components/production/BOMManagementPage";

export default function BomPageRoute() {
  const params = useParams();
  const companyId = params?.companyId as string;
  return <BOMManagementPage companyId={companyId} />;
}
