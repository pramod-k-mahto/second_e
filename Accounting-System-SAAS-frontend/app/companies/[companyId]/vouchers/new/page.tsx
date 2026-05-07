"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function NewSimpleVoucherRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;

  useEffect(() => {
    if (!companyId) return;
    router.replace(`/companies/${companyId}/vouchers`);
  }, [companyId, router]);

  return (
    <div className="p-4 text-sm text-slate-600">
      Redirecting to vouchers...
    </div>
  );
}
