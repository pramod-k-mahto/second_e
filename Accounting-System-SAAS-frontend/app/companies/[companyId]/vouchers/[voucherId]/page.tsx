"use client";

import useSWR from "swr";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { api, Voucher, DepartmentRead, ProjectRead } from "@/lib/api";
import { invalidateAccountingReports } from "@/lib/invalidateAccountingReports";

import { useMenuAccess } from "@/components/MenuPermissionsContext";
import { CalculatorModal } from "@/components/CalculatorModal";
import { mutate as globalMutate } from "swr";

import { useToast } from "@/components/ui/Toast";
import { Select } from "@/components/ui/Select";
import { useCalendarSettings } from "@/components/CalendarSettingsContext";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function VoucherDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = params?.companyId as string;
  const voucherId = params?.voucherId as string;

  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);

  const { data: voucher, error } = useSWR<Voucher | null>(
    companyId && voucherId
      ? `/companies/${companyId}/vouchers/${voucherId}`
      : null,
    fetcher
  );

  const { calendarMode, displayMode: dateDisplayMode, reportMode } = useCalendarSettings();
  const isBS = reportMode === 'BS';

  const { data: ledgers } = useSWR<any[]>(
    companyId ? `/ledgers/companies/${companyId}/ledgers` : null,
    fetcher
  );

  const { data: customerMappings } = useSWR(
    companyId
      ? `/companies/${companyId}/reports/customer-ledger-mapping?has_ledger=true`
      : null,
    fetcher
  );

  const { data: supplierMappings } = useSWR(
    companyId
      ? `/companies/${companyId}/reports/supplier-ledger-mapping?has_ledger=true`
      : null,
    fetcher
  );

  const { data: departments } = useSWR<DepartmentRead[]>(
    companyId ? `/companies/${companyId}/departments` : null,
    fetcher
  );

  const { data: projects } = useSWR<ProjectRead[]>(
    companyId ? `/companies/${companyId}/projects` : null,
    fetcher
  );

  const { data: segments } = useSWR<any[]>(
    companyId ? `/companies/${companyId}/segments` : null,
    fetcher
  );

  const { data: employees } = useSWR<any[]>(
    companyId ? `/payroll/companies/${companyId}/employees` : null,
    fetcher
  );

  const ledgerName = (id: number): string => {
    if (!ledgers) return String(id);
    const found = ledgers.find((l: any) => l.id === id);
    return found?.name || String(id);
  };

  const departmentNameById = useMemo(() => {
    const map: Record<number, string> = {};
    (departments || []).forEach((d) => {
      map[d.id] = d.name;
    });
    return map;
  }, [departments]);

  const projectNameById = useMemo(() => {
    const map: Record<number, string> = {};
    (projects || []).forEach((p) => {
      map[p.id] = p.name;
    });
    return map;
  }, [projects]);
 
  const segmentNameById = useMemo(() => {
    const map: Record<number, string> = {};
    (segments || []).forEach((s: any) => {
      map[s.id] = s.name;
    });
    return map;
  }, [segments]);

  const employeeNameById = useMemo(() => {
    const map: Record<number, string> = {};
    (employees || []).forEach((e: any) => {
      map[e.id] = e.full_name;
    });
    return map;
  }, [employees]);

  const partyLabel = useMemo(() => {
    const v: any = voucher as any;
    if (!v) return "";

    const lid = Number(v.counterparty_ledger_id || 0);
    if (!lid) return "";

    const custArr = (customerMappings || []) as any[];
    const suppArr = (supplierMappings || []) as any[];

    const cust = custArr.find((m) => Number(m.ledger_id) === lid);
    if (cust && cust.customer_name) {
      return `Customer: ${String(cust.customer_name)}`;
    }

    const supp = suppArr.find((m) => Number(m.ledger_id) === lid);
    if (supp && supp.supplier_name) {
      return `Supplier: ${String(supp.supplier_name)}`;
    }

    return "";
  }, [voucher, customerMappings, supplierMappings]);

  const voucherAmount = Number((voucher as any)?.total_amount || 0);

  const voucherType = (voucher?.voucher_type as string) || "PAYMENT";

  const getVoucherMenuCode = (type: string): string => {
    switch (type) {
      case "PAYMENT":
        return "accounting.voucher.payment";
      case "RECEIPT":
        return "accounting.voucher.receipt";
      case "CONTRA":
        return "accounting.voucher.contra";
      case "JOURNAL":
      default:
        return "accounting.voucher.journal";
    }
  };

  const voucherMenuCode = getVoucherMenuCode(voucherType);
  const { canDelete } = useMenuAccess(voucherMenuCode);

  const { showToast } = useToast();

  const handleBack = () => {
    const returnUrl = searchParams.get('returnUrl');
    if (returnUrl) {
      router.push(returnUrl);
      return;
    }

    if (typeof window !== "undefined") {
      window.history.back();
      return;
    }
    router.back();
  };

  const handleClose = () => {
    // If this detail page was opened in a separate window/tab via script,
    // allow that window to be closed. In a normal SPA tab, most browsers
    // will ignore window.close(), so we should navigate instead.
    if (typeof window !== "undefined" && window.opener) {
      window.close();
      return;
    }

    if (companyId) {
      // Navigate back to the vouchers list for this company
      router.push(`/companies/${companyId}/vouchers`);
    } else {
      router.back();
    }
  };

  const handleReverse = async () => {
    if (!companyId || !voucherId) return;

    if (typeof window !== "undefined") {
      const ok = window.confirm(
        "Create a reversing voucher for this voucher?"
      );
      if (!ok) return;
    }

    try {
      await api.post(
        `/companies/${companyId}/vouchers/${voucherId}/reverse`
      );

      await invalidateAccountingReports(companyId);
      if (typeof window !== "undefined") {
        window.alert("Reversing voucher created.");
      }
    } catch (err: any) {
      const msg =
        (err?.response?.data as any)?.detail ||
        "Unable to create reversing voucher";
      if (typeof window !== "undefined") {
        window.alert(String(msg));
      }
    }
  };

  const handleDelete = async () => {
    if (!companyId || !voucherId) return;
    if (!canDelete) return;

    if (!confirm("Delete this voucher? This cannot be undone.")) return;
    try {
      await api.delete(`/companies/${companyId}/vouchers/${voucherId}`);
      await globalMutate(
        (key) =>
          typeof key === "string" &&
          (key === `/companies/${companyId}/vouchers` ||
            key.startsWith(`/companies/${companyId}/vouchers?`))
      );

      await globalMutate(
        (key) =>
          typeof key === "string" &&
          key.startsWith(`/inventory/companies/${companyId}/stock/`)
      );

      await globalMutate(
        (key) =>
          typeof key === "string" &&
          (key === `/companies/${companyId}/bills` ||
            key.startsWith(`/companies/${companyId}/bills?`) ||
            key.startsWith(`/companies/${companyId}/reports/ledger`) ||
            key.startsWith(`/companies/${companyId}/reports/daybook`))
      );

      await invalidateAccountingReports(companyId);

      showToast({ title: "Voucher deleted", variant: "success" });
      router.back();
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;

      if (status === 409) {
        const msg = typeof detail === "string" ? detail : String(detail);
        if (typeof window !== "undefined") {
          window.alert(msg);
        }
        return;
      }

      const msg = typeof detail === "string" ? detail : "Unable to delete voucher";
      showToast({ title: "Delete failed", description: msg, variant: "error" });
    }
  };

  const handleEdit = () => {
    if (!companyId || !voucherId) return;
    router.push(`/companies/${companyId}/vouchers?id=${voucherId}`);
  };

  const formatDate = (date: string | null | undefined) => {
    if (!date) return "";
    const [y, m, d] = date.split("-").map((v) => Number(v));
    if (!y || !m || !d) return date;
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const displayVoucherDate = useMemo(() => {
    const v: any = voucher as any;
    if (!v) return '';

    if (dateDisplayMode === 'BOTH') {
      const bs = v.voucher_date_bs ? String(v.voucher_date_bs) : '—';
      const ad = v.voucher_date ? formatDate(String(v.voucher_date)) : '—';
      return `${bs} / ${ad}`;
    }

    if (dateDisplayMode === 'BS') {
      if (v.voucher_date_bs) return String(v.voucher_date_bs);
      return formatDate(String(v.voucher_date || ''));
    }

    return formatDate(String(v.voucher_date || ''));
  }, [voucher, dateDisplayMode]);

  const formatAmount = (value: number) => {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(value || 0);
  };

  const totalDebit =
    voucher?.lines?.reduce((sum, l) => sum + Number((l as any).debit || 0), 0) || 0;
  const totalCredit =
    voucher?.lines?.reduce((sum, l) => sum + Number((l as any).credit || 0), 0) || 0;

  const hasDepartment = useMemo(() => {
    return (voucher as any)?.department_id || voucher?.lines?.some(l => (l as any).department_id);
  }, [voucher]);

  const hasProject = useMemo(() => {
    return (voucher as any)?.project_id || voucher?.lines?.some(l => (l as any).project_id);
  }, [voucher]);

  const hasSegment = useMemo(() => {
    return (voucher as any)?.segment_id || voucher?.lines?.some(l => (l as any).segment_id);
  }, [voucher]);

  const hasEmployee = useMemo(() => {
    return (voucher as any)?.employee_id || voucher?.lines?.some(l => (l as any).employee_id);
  }, [voucher]);

  const showCreatedBanner = searchParams?.get("created") === "1";

  return (
    <div className="mx-auto max-w-4xl space-y-4 rounded-xl border border-border-light dark:border-border-dark bg-surface-light/90 dark:bg-slate-900/90 p-4 shadow-sm md:p-6">
      {showCreatedBanner && voucher && (
        <div className="mb-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-500/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          {`${voucherType} voucher ${voucher.voucher_number || voucher.id} for ${formatAmount(
            voucherAmount
          )} created successfully.`}
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border-light/70 dark:border-border-dark/70 pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-light dark:text-muted-dark">
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center rounded-md border border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900 px-2 py-1 text-[11px] text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              ← Back
            </button>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-100">
              {voucherType}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Voucher {voucher?.voucher_number || voucher?.id || ""}
            </h1>

            {voucher && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                on {displayVoucherDate}
              </span>
            )}
          </div>
          {voucher && (
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-light dark:text-muted-dark">

              <span>Type: {voucher.voucher_type}</span>
              <span className="h-1 w-1 rounded-full bg-border-light/80 dark:bg-border-dark/70" />

              <span>Fiscal year: {voucher.fiscal_year || "N/A"}</span>
              {voucher.narration && (
                <>
                  <span className="h-1 w-1 rounded-full bg-border-light/80 dark:bg-border-dark/70" />

                  <span className="truncate max-w-xs" title={voucher.narration}>
                    {voucher.narration}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 text-right">
          <div className="flex flex-col gap-1 text-[11px]">
            <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
              Date Display
            </label>
            <Select
              className="h-8 px-2 py-1 text-xs min-w-[120px]"
              value={dateDisplayMode}
              onChange={() => {}}
              disabled
            >
              <option value={dateDisplayMode}>{dateDisplayMode}</option>
            </Select>
          </div>
          {voucher && (
            <div className="rounded-lg border border-success-500/40 bg-accent-50 px-3 py-2 text-xs text-emerald-800 shadow-sm dark:border-success-500/50 dark:bg-slate-900/70 dark:text-emerald-200">
              <div className="text-[10px] uppercase tracking-wide text-emerald-700/80 dark:text-emerald-200/80">

                Voucher Amount
              </div>
              <div className="text-sm font-semibold tabular-nums">
                {formatAmount(voucherAmount)}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {voucher && (voucher as any).status && (
              <span className="rounded-full border border-border-light dark:border-border-dark bg-surface-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                Status: {(voucher as any).status}
              </span>
            )}
            {voucher && (voucher as any).status === "ACTIVE" && (
              <button
                type="button"
                onClick={handleReverse}
                className="rounded-md border border-brand-200 bg-brand-50 px-3 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-100 dark:border-brand-400/60 dark:bg-slate-900/70 dark:text-brand-100 dark:hover:bg-slate-900"
              >
                Reverse
              </button>
            )}
            {voucher && canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-md border border-critical-500/60 bg-white px-3 py-1 text-[11px] font-medium text-critical-600 hover:bg-red-50 dark:border-critical-500/70 dark:bg-slate-900 dark:text-critical-500 dark:hover:bg-red-950/30"
              >
                Delete
              </button>
            )}
            {voucher && (
              <button
                type="button"
                onClick={handleEdit}
                className="rounded-md border border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900 px-3 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsCalculatorOpen(true)}
              className="rounded-md border border-brand-200 bg-brand-50 px-3 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-100 dark:border-brand-400/60 dark:bg-slate-900/70 dark:text-brand-100 dark:hover:bg-slate-900"
            >
              Calculator
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md border border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900 px-3 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-critical-500/40 bg-red-50 px-3 py-2 text-xs text-critical-600 dark:border-critical-500/70 dark:bg-red-950/40 dark:text-critical-500">
          Failed to load voucher details.
        </div>
      )}

      {!voucher && !error && (
        <div className="space-y-1 text-xs text-muted-light dark:text-muted-dark">
          <div className="h-3 w-32 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/60" />
          <div className="h-3 w-48 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/60" />
          <div className="h-3 w-40 animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
        </div>
      )}

      {voucher && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1 rounded-lg border border-border-light dark:border-border-dark bg-surface-muted p-3 text-xs text-slate-700 dark:bg-slate-900/80 dark:text-slate-200">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-light dark:text-muted-dark">

                Summary
              </div>
              <div>
                <span className="font-medium">Narration:</span>{" "}
                <span>{voucher.narration || "—"}</span>
              </div>
              <div>
                <span className="font-medium">Voucher Total:</span>{" "}
                <span>{formatAmount(voucherAmount)}</span>
              </div>
              {partyLabel && (
                <div>
                  <span className="font-medium">Party:</span>{" "}
                  <span>{partyLabel}</span>
                </div>
              )}
              {voucher && (voucher as any).department_id && (
                <div>
                  <span className="font-medium">Department:</span>{" "}
                  <span>{departmentNameById[(voucher as any).department_id] || (voucher as any).department_id}</span>
                </div>
              )}
              {voucher && (voucher as any).project_id && (
                <div>
                  <span className="font-medium">Project:</span>{" "}
                  <span>{projectNameById[(voucher as any).project_id] || (voucher as any).project_id}</span>
                </div>
              )}
              {voucher && (voucher as any).segment_id && (
                <div>
                  <span className="font-medium">Segment:</span>{" "}
                  <span>{segmentNameById[(voucher as any).segment_id] || (voucher as any).segment_id}</span>
                </div>
              )}
              {voucher && (voucher as any).employee_id && (
                <div>
                  <span className="font-medium">Employee:</span>{" "}
                  <span>{employeeNameById[(voucher as any).employee_id] || (voucher as any).employee_id}</span>
                </div>
              )}
            </div>

            <div className="space-y-1 rounded-lg border border-border-light dark:border-border-dark bg-surface-light p-3 text-xs text-slate-700 shadow-sm dark:bg-slate-950 dark:text-slate-200">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-light dark:text-muted-dark">

                Ledger Summary
              </div>
              <div className="flex justify-between">
                <span>Total lines</span>
                <span className="font-medium tabular-nums">{voucher.lines.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Total debit</span>
                <span className="font-medium tabular-nums">{formatAmount(totalDebit)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total credit</span>
                <span className="font-medium tabular-nums">{formatAmount(totalCredit)}</span>
              </div>
              <div className="mt-1 flex justify-between text-[11px]">
                <span className="text-muted-light dark:text-muted-dark">Balanced</span>

                <span
                  className={
                    Math.abs(totalDebit - totalCredit) < 0.01
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }
                >
                  {Math.abs(totalDebit - totalCredit) < 0.01 ? "Yes" : "No"}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border-light dark:border-border-dark bg-surface-light p-3 text-xs shadow-sm dark:bg-slate-950">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-light dark:text-muted-dark">

                Ledger Lines
              </h2>
            </div>
            {voucher.lines.length === 0 ? (
              <p className="text-xs text-muted-light dark:text-muted-dark">No lines.</p>
            ) : (
              <div className="overflow-hidden rounded-md border border-border-light dark:border-border-dark">
                <table className="min-w-full divide-y divide-slate-100 text-xs dark:divide-slate-800">
                  <thead className="bg-surface-muted dark:bg-slate-900/80">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium text-slate-500 dark:text-slate-300">
                        Ledger
                      </th>
                      {hasDepartment && (
                        <th className="px-2 py-2 text-left font-medium text-slate-500 dark:text-slate-300">
                          Department
                        </th>
                      )}
                      {hasProject && (
                        <th className="px-2 py-2 text-left font-medium text-slate-500 dark:text-slate-300">
                          Project
                        </th>
                      )}
                      {hasSegment && (
                        <th className="px-2 py-2 text-left font-medium text-slate-500 dark:text-slate-300">
                          Segment
                        </th>
                      )}
                      {hasEmployee && (
                        <th className="px-2 py-2 text-left font-medium text-slate-500 dark:text-slate-300">
                          Employee
                        </th>
                      )}
                      <th className="px-2 py-2 text-left font-medium text-slate-500 dark:text-slate-300">
                        Remarks
                      </th>
                      <th className="px-2 py-2 text-right font-medium text-slate-500 dark:text-slate-300">
                        Debit
                      </th>
                      <th className="px-2 py-2 text-right font-medium text-slate-500 dark:text-slate-300">
                        Credit
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-surface-light dark:divide-slate-800 dark:bg-slate-950">
                    {voucher.lines.map((line: any) => (
                      <tr key={line.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/80">
                        <td className="px-2 py-1.5 text-slate-800 dark:text-slate-100">
                          {line.ledger_name
                            ? `${line.ledger_id} - ${line.ledger_name}`
                            : `${line.ledger_id} - ${ledgerName(line.ledger_id)}`}
                        </td>
                        {hasDepartment && (
                          <td className="px-2 py-1.5 text-slate-800 dark:text-slate-100">
                            {line.department_name
                              ? line.department_name
                              : line.department_id
                              ? departmentNameById[line.department_id] || line.department_id
                              : "—"}
                          </td>
                        )}
                        {hasProject && (
                          <td className="px-2 py-1.5 text-slate-800 dark:text-slate-100">
                            {line.project_name
                              ? line.project_name
                              : line.project_id
                              ? projectNameById[line.project_id] || line.project_id
                              : "—"}
                          </td>
                        )}
                        {hasSegment && (
                          <td className="px-2 py-1.5 text-slate-800 dark:text-slate-100">
                            {line.segment_name
                              ? line.segment_name
                              : line.segment_id
                              ? segmentNameById[line.segment_id] || line.segment_id
                              : "—"}
                          </td>
                        )}
                        {hasEmployee && (
                          <td className="px-2 py-1.5 text-slate-800 dark:text-slate-100">
                            {line.employee_name
                              ? line.employee_name
                              : line.employee_id
                              ? employeeNameById[line.employee_id] || line.employee_id
                              : "—"}
                          </td>
                        )}
                        <td className="px-2 py-1.5 text-slate-800 dark:text-slate-100 max-w-[200px] truncate" title={line.remarks || ""}>
                          {line.remarks || "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-800 dark:text-slate-100">
                          {formatAmount(line.debit || 0)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-800 dark:text-slate-100">
                          {formatAmount(line.credit || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 dark:bg-slate-900/80">
                    <tr>
                      <td className="px-2 py-1.5 text-right text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                        Totals
                      </td>
                      {hasDepartment && <td />}
                      {hasProject && <td />}
                      {hasSegment && <td />}
                      {hasEmployee && <td />}
                      <td />
                      <td className="px-2 py-1.5 text-right text-[11px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                        {formatAmount(totalDebit)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-[11px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                        {formatAmount(totalCredit)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}
      <CalculatorModal
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
      />
    </div>
  );
}