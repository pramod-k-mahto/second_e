import { api } from "./api";

async function downloadPdfViaApi(url: string, filename: string) {
  const res = await api.get(url, { responseType: "blob" });
  const blob = new Blob([res.data], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function openDaybookPdf(
  companyId: number,
  params: { fromDate?: string; toDate?: string; onDate?: string; voucherType?: string }
) {
  const qs = new URLSearchParams();
  if (params.fromDate) qs.set("from_date", params.fromDate); // YYYY-MM-DD
  if (params.toDate) qs.set("to_date", params.toDate);
  if (params.onDate) qs.set("on_date", params.onDate);
  if (params.voucherType) qs.set("voucher_type", params.voucherType);

  const url = `/reports/companies/${companyId}/reports/daybook.pdf?${qs.toString()}`;
  await downloadPdfViaApi(url, "daybook.pdf");
}

export async function openTrialBalancePdf(companyId: number, asOnDate: string) {
  const url = `/reports/companies/${companyId}/reports/trial-balance.pdf?as_on_date=${encodeURIComponent(
    asOnDate,
  )}`;
  await downloadPdfViaApi(url, `trial-balance-${asOnDate}.pdf`);
}

export async function openBalanceSheetPdf(companyId: number, asOnDate: string) {
  const url = `/reports/companies/${companyId}/reports/balance-sheet.pdf?as_on_date=${encodeURIComponent(
    asOnDate,
  )}`;
  await downloadPdfViaApi(url, `balance-sheet-${asOnDate}.pdf`);
}

export async function openProfitAndLossPdf(companyId: number, fromDate: string, toDate: string) {
  const qs = new URLSearchParams({ from_date: fromDate, to_date: toDate });
  const url = `/reports/companies/${companyId}/reports/profit-and-loss.pdf?${qs.toString()}`;
  await downloadPdfViaApi(url, `profit-and-loss-${fromDate}-to-${toDate}.pdf`);
}

export async function openLedgerPdf(
  companyId: number,
  ledgerId: number,
  fromDate: string,
  toDate: string,
) {
  const qs = new URLSearchParams({
    ledger_id: String(ledgerId),
    from_date: fromDate,
    to_date: toDate,
  });
  const url = `/reports/companies/${companyId}/reports/ledger.pdf?${qs.toString()}`;
  await downloadPdfViaApi(url, `ledger-${ledgerId}-${fromDate}-to-${toDate}.pdf`);
}
