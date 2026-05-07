import { redirect } from "next/navigation";

export default function CashVoucherPage({
  params,
}: {
  params: { companyId: string };
}) {
  redirect(`/companies/${params.companyId}/vouchers`);
}
