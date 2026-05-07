"use client";
import { useParams } from "next/navigation";
import { ManufacturingERPPage } from "@/components/manufacturing/ManufacturingERPPage";
export default function ManufacturingEntryRoute() {
  const params = useParams();
  return <ManufacturingERPPage companyId={String(params?.companyId || "")} section="production-entry" />;
}
