"use client";
import { useParams } from "next/navigation";
import { ManufacturingERPPage } from "@/components/manufacturing/ManufacturingERPPage";
export default function ManufacturingSettingsRoute() {
  const params = useParams();
  return <ManufacturingERPPage companyId={String(params?.companyId || "")} section="settings" />;
}
