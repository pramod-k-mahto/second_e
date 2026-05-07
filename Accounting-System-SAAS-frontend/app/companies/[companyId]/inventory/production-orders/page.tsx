"use client";

import { useParams } from "next/navigation";
import { ProductionOrderPage } from "@/components/production/ProductionOrderPage";

export default function ProductionOrdersRoute() {
  const params = useParams();
  const companyId = params?.companyId as string;
  return <ProductionOrderPage companyId={companyId} />;
}
