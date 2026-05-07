import { mutate as globalMutate } from "swr";

export async function invalidateAccountingReports(companyId: string | number) {
  const companyIdStr = String(companyId);

  await globalMutate(
    (key) => {
      if (typeof key === "string") {
        return (
          key.startsWith(`/companies/${companyIdStr}/reports/trial-balance`) ||
          key.startsWith(`/companies/${companyIdStr}/reports/balance-sheet`) ||
          key.startsWith(`/companies/${companyIdStr}/reports/balance-sheet-hierarchical`) ||
          key.startsWith(`/companies/${companyIdStr}/reports/profit-and-loss`) ||
          key.startsWith(`/companies/${companyIdStr}/reports/profit-and-loss-structured`) ||
          key.startsWith(`/companies/${companyIdStr}/reports/profit-and-loss-hierarchical`) ||
          key.startsWith(`/companies/${companyIdStr}/reports/ledger`) ||
          key.startsWith(`/companies/${companyIdStr}/reports/daybook`) ||
          key.startsWith(`/companies/${companyIdStr}/reports/inventory-valuation`) ||
          key.startsWith(`/inventory/companies/${companyIdStr}/stock/summary`) ||
          key.startsWith(`/inventory/companies/${companyIdStr}/stock/valuation`) ||
          key.startsWith(`/inventory/companies/${companyIdStr}/stock/ledger`) ||
          key === `/companies/${companyIdStr}` ||
          key.startsWith(`/companies/${companyIdStr}?`) ||
          key === `/ledgers/companies/${companyIdStr}/ledgers` ||
          key.startsWith(`/ledgers/companies/${companyIdStr}/ledgers?`)
        );
      }

      if (Array.isArray(key)) {
        const first = key[0];
        const second = key[1];
        if (first === "stock-valuation" && String(second) === companyIdStr) return true;
        if (first === "stock-summary" && String(second) === companyIdStr) return true;
        if (first === "stock-period-report" && String(second) === companyIdStr) return true;
        if (first === "stock-ledger" && String(second) === companyIdStr) return true;
      }

      return false;
    },
    undefined,
    { revalidate: true }
  );
}
