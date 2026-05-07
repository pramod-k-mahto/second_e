"use client";
import { useParams } from "next/navigation";
import { ManufacturingERPPage } from "@/components/manufacturing/ManufacturingERPPage";
export default function ManufacturingFgRoute() {
  const params = useParams();
  return <ManufacturingERPPage companyId={String(params?.companyId || "")} section="finished-goods-receive" />;
}
