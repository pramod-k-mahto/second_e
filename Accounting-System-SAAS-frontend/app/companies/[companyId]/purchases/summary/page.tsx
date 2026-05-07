"use client";

import useSWR from "swr";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useMemo, useState, useEffect, useRef } from "react";
import { api, getCurrentCompany, getSmartDefaultPeriod, type CurrentCompany } from "@/lib/api";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import "nepali-datepicker-reactjs/dist/index.css";
import { safeADToBS, safeBSToAD } from "@/lib/bsad";
import { useCalendarSettings } from "@/components/CalendarSettingsContext";
import {
  CalendarDisplayMode,
  CalendarReportDisplayMode,
} from "@/lib/calendarMode";
import { Input } from "@/components/ui/Input";


const fetcher = (url: string) => api.get(url).then((res) => res.data);

const AVAILABLE_COLUMNS = [
  { id: "date", label: "Bill Date" },
  { id: "transaction_date", label: "TX Date" },
  { id: "voucher_number", label: "Voucher No." },
  { id: "due_date", label: "Due Date" },
  { id: "bill_no", label: "Bill No." },
  { id: "custom_reference", label: "Custom Ref." },
  { id: "supplier_name", label: "Supplier Name" },
  { id: "item_name", label: "Item Name" },
  { id: "hs_code", label: "HS Code" },
  { id: "warehouse", label: "Warehouse" },
  { id: "quantity", label: "Qty" },
  { id: "rate", label: "Rate" },
  { id: "discount", label: "Discount" },
  { id: "tax", label: "Tax %" },
  { id: "tax_amount", label: "Tax Amount" },
  { id: "tds_amount", label: "TDS Deducted" },
  { id: "amount", label: "Amount" },
  { id: "purchaser", label: "Purchaser" },
  { id: "department", label: "Department" },
  { id: "project", label: "Project" },
  { id: "segment", label: "Segment" },
  { id: "payment_mode", label: "Payment Mode" },
  { id: "narration", label: "Narration" },
  { id: "remarks", label: "Remarks" },
];

export default function PurchaseSummaryPage() {
  const params = useParams();
  const companyId = params?.companyId as string;
  const searchParams = useSearchParams();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);

  // 1. Immediate initialization from localStorage
  const initialCC = typeof window !== 'undefined' ? getCurrentCompany() : null;
  const initialMode = initialCC?.calendar_mode || "AD";
  
  let initialFrom = "";
  let initialTo = "";

  if (initialCC?.fiscal_year_start && initialCC?.fiscal_year_end) {
    initialFrom = initialCC.fiscal_year_start;
    initialTo = initialCC.fiscal_year_end;
  } else {
    const defaultPeriod = getSmartDefaultPeriod("AD", initialCC);
    initialFrom = defaultPeriod.from;
    initialTo = defaultPeriod.to;
  }

  // Context-based calendar settings
  const { calendarMode, displayMode, reportMode: contextReportMode, setReportMode, isLoading: calendarLoading } = useCalendarSettings();

  const [useEffectSyncDone, setUseEffectSyncDone] = useState(false);
  const [fromDate, setFromDate] = useState(initialFrom);
  const [toDate, setToDate] = useState(initialTo);

  const effectiveDisplayMode = contextReportMode || initialMode;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync state if settings change
  useEffect(() => {
    if (mounted && !useEffectSyncDone) {
        setFromDate(initialFrom);
        setToDate(initialTo);
        setUseEffectSyncDone(true);
    }
  }, [mounted, initialFrom, initialTo, useEffectSyncDone]);

  const [supplierId, setSupplierId] = useState("");
  const [itemNameFilter, setItemNameFilter] = useState("");
  const [voucherNumberFilter, setVoucherNumberFilter] = useState("");
  const [billNoFilter, setBillNoFilter] = useState("");

  const isBS = effectiveDisplayMode === "BS";

  const initialVisibleCols = {
    date: true,
    transaction_date: false,
    voucher_number: true,
    due_date: false,
    bill_no: true,
    custom_reference: false,
    supplier_name: true,
    item_name: true,
    warehouse: false,
    quantity: true,
    rate: true,
    discount: true,
    tax: true,
    tax_amount: false,
    tds_amount: true,
    amount: true,
    purchaser: false,
    department: false,
    project: false,
    segment: false,
    payment_mode: false,
    narration: false,
    remarks: false,
  };

  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(initialVisibleCols);
  const [columnOrder, setColumnOrder] = useState<string[]>(
    AVAILABLE_COLUMNS.filter(c => (initialVisibleCols as any)[c.id]).map(c => c.id)
  );

  const { data: bills } = useSWR(
    companyId ? `/purchases/companies/${companyId}/bills` : null,
    fetcher
  );
  const { data: suppliers } = useSWR(
    companyId ? `/purchases/companies/${companyId}/suppliers` : null,
    fetcher
  );
  const { data: items } = useSWR(
    companyId ? `/inventory/companies/${companyId}/items` : null,
    fetcher
  );
  const { data: warehouses } = useSWR(
    companyId ? `/inventory/companies/${companyId}/warehouses` : null,
    fetcher
  );
  const { data: departments } = useSWR(
    companyId ? `/companies/${companyId}/departments` : null,
    fetcher
  );
  const { data: projects } = useSWR(
    companyId ? `/companies/${companyId}/projects` : null,
    fetcher
  );
  const { data: segments } = useSWR(
    companyId ? `/companies/${companyId}/segments` : null,
    fetcher
  );
  const { data: purchasers } = useSWR(
    companyId ? `/companies/${companyId}/purchasers?is_active=true` : null,
    fetcher
  );
  const { data: paymentModes } = useSWR(
    companyId ? `/payment-modes/companies/${companyId}/payment-modes?is_active=true` : null,
    fetcher
  );

  const toggleColumn = (colId: string) => {
    setVisibleCols(prev => {
      const isVisible = prev[colId];
      if (isVisible) {
        setColumnOrder(order => order.filter(id => id !== colId));
        return { ...prev, [colId]: false };
      } else {
        setColumnOrder(order => order.includes(colId) ? order : [...order, colId]);
        return { ...prev, [colId]: true };
      }
    });
  };

  const [reportType, setReportType] = useState<"detailed" | "summary">("detailed");

  const isAllSelected = useMemo(() =>
    AVAILABLE_COLUMNS.every(col => !!visibleCols[col.id]),
    [visibleCols]
  );

  const toggleAllColumns = () => {
    if (isAllSelected) {
      const allUnselected = AVAILABLE_COLUMNS.reduce((acc, col) => ({ ...acc, [col.id]: false }), {} as Record<string, boolean>);
      setVisibleCols(allUnselected);
      setColumnOrder([]);
    } else {
      const allSelected = AVAILABLE_COLUMNS.reduce((acc, col) => ({ ...acc, [col.id]: true }), {} as Record<string, boolean>);
      setVisibleCols(allSelected);
      setColumnOrder(AVAILABLE_COLUMNS.map(c => c.id));
    }
  };

  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = (preview: boolean) => {
    if (!printRef.current) return;
    const printContents = printRef.current.innerHTML;
    const originalHead = document.head.innerHTML;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.open();
    win.document.write(
      `<!doctype html><html><head>${originalHead}<style>.print-hidden{display:none !important;} .hidden{display:none !important;} .print\\:block{display:block !important;} .print\\:hidden{display:none !important;} table{border-collapse:collapse;width:100%;font-size:10px;} th,td{border:1px solid #e2e8f0;padding:3px 5px;} .print-toolbar{padding:8px 12px;border-bottom:1px solid #e2e8f0;display:flex;gap:8px;align-items:center;font-family:sans-serif;background:#f8fafc;} .print-toolbar button{padding:4px 12px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;font-size:11px;cursor:pointer;font-weight:600;} .print-toolbar button:hover{background:#f1f5f9;} .print-toolbar .primary{background:#4f46e5;color:#fff;border-color:#4f46e5;} .print-toolbar .primary:hover{background:#4338ca;} @media print{.print-toolbar{display:none !important;} body{-webkit-print-color-adjust:exact;print-color-adjust:exact;} table{page-break-inside:auto;} tr{page-break-inside:avoid;} thead{display:table-header-group;}} @page{size:landscape;margin:6mm;}</style></head><body><div class="print-toolbar"><button class="primary" onclick="window.print()">Print</button><button onclick="window.close()">Close</button></div>${printContents}<script>(function(){var st=document.createElement('style');st.textContent='@page{size:landscape;margin:6mm;}';document.head.appendChild(st);${preview ? '' : 'window.onload=function(){window.print();}'}})()</script></body></html>`
    );
    win.document.close();
    if (preview) {
        win.focus();
    }
  };

  const filtered = useMemo(() => {
    if (!bills) return [] as any[];
    const term = itemNameFilter.trim().toLowerCase();
    const effectiveFromAD = fromDate;
    const effectiveToAD = toDate;

    return (bills as any[]).filter((bill) => {
      if (effectiveFromAD && bill.date < effectiveFromAD) return false;
      if (effectiveToAD && bill.date > effectiveToAD) return false;
      if (supplierId && String(bill.supplier_id) !== supplierId) return false;

      if (voucherNumberFilter.trim()) {
        const vNum = (bill.voucher_number || "").toString().toLowerCase();
        if (!vNum.includes(voucherNumberFilter.trim().toLowerCase())) return false;
      }

      if (billNoFilter.trim()) {
        const bNo = (bill.reference || "").toString().toLowerCase();
        if (!bNo.includes(billNoFilter.trim().toLowerCase())) return false;
      }

      if (term) {
        const lines = (bill.lines || []) as any[];
        const match = lines.some((l: any) => {
          const item = items?.find((it: any) => it.id === l.item_id);
          const name = (item?.name || "").toString().toLowerCase();
          return name.includes(term);
        });
        if (!match) return false;
      }
      return true;
    });
  }, [bills, fromDate, toDate, supplierId, itemNameFilter, items, isBS]);

  const billTotal = (bill: any) => {
    if (!bill?.lines || !Array.isArray(bill.lines)) return 0;
    return bill.lines.reduce((sum: number, l: any) => {
      const qty = Number(l.quantity || 0);
      const rate = Number(l.rate || 0);
      const disc = Number(l.discount || 0);
      const taxRate = Number(l.tax_rate || 0);
      const base = qty * rate - disc;
      const tax = (base * taxRate) / 100;
      return sum + base + tax;
    }, 0);
  };

  const detailedRows = useMemo(() => {
    const rows: any[] = [];
    for (const bill of filtered) {
      if (!bill.lines || !Array.isArray(bill.lines)) continue;
      for (const line of bill.lines) {
        const item = items?.find((it: any) => it.id === line.item_id);
        const itemName = item?.name || `Item #${line.item_id}`;

        const supplier = suppliers?.find((s: any) => s.id === bill.supplier_id);
        const supplierName = supplier?.name || `Supplier #${bill.supplier_id}`;

        const warehouse = warehouses?.find((w: any) => w.id === line.warehouse_id);
        const warehouseName = warehouse?.name || "";

        const prId = line.purchaser_id || bill.purchaser_id;
        const pr = purchasers?.find((s: any) => s.id === prId);
        const prName = pr?.name || "";

        const depId = line.department_id || bill.department_id;
        const dep = departments?.find((d: any) => d.id === depId);
        const depName = dep?.name || "";

        const projId = line.project_id || bill.project_id;
        const proj = projects?.find((p: any) => p.id === projId);
        const projName = proj?.name || "";

        const segId = line.segment_id || bill.segment_id;
        const seg = segments?.find((s: any) => s.id === segId);
        const segName = seg?.name || "";

        const qty = Number(line.quantity || 0);
        const rate = Number(line.rate || 0);
        const disc = Number(line.discount || 0);
        const taxRate = Number(line.tax_rate || 0);
        const base = qty * rate - disc;
        const tax = base * (taxRate / 100);
        const amount = base + tax;

        // TDS is stored at the bill level (shared across lines); distribute proportionally
        const lineProportion = bill.lines.length > 1 ? 1 / bill.lines.length : 1;
        const billTdsAmount = Number(bill.tds_amount || 0);
        const lineTdsAmount = bill.apply_tds ? billTdsAmount * lineProportion : 0;

        rows.push({
          date: isBS ? (safeADToBS(bill.date) || bill.date) : bill.date,
          transaction_date: bill.transaction_date ? (isBS ? (safeADToBS(bill.transaction_date) || bill.transaction_date) : bill.transaction_date) : "",
          voucher_number: bill.voucher_number || "",
          due_date: isBS ? (safeADToBS(bill.due_date || bill.date) || bill.due_date || bill.date) : (bill.due_date || bill.date),
          bill_no: bill.reference,
          custom_reference: bill.custom_reference || "",
          supplier_name: supplierName,
          item_name: itemName,
          hs_code: line.hs_code || "",
          warehouse: warehouseName,
          quantity: qty,
          rate: rate,
          discount: disc,
          tax: taxRate,
          tax_amount: tax,
          tds_amount: lineTdsAmount,
          amount: amount,
          purchaser: prName,
          department: depName,
          project: projName,
          segment: segName,
          payment_mode: paymentModes && Array.isArray(paymentModes)
            ? paymentModes.find((p: any) => p.id === bill.payment_mode_id)?.name || ""
            : "",
          narration: bill.narration || "",
          remarks: line.remarks || "",
        });
      }
    }
    return rows;
  }, [filtered, items, suppliers, warehouses, purchasers, departments, projects, segments, paymentModes, isBS]);

  const summaryRows = useMemo(() => {
    const groupedMap = new Map<number | string, any>();

    filtered.forEach((bill) => {
      if (bill.lines && Array.isArray(bill.lines)) {
        bill.lines.forEach((l: any) => {
          const itemId = l.item_id || `none-${l.description || "unknown"}`;
          const itemName = l.item_id ? (items?.find((it: any) => it.id === l.item_id)?.name || `#${l.item_id}`) : (l.description || "N/A");
          const supplierName = suppliers?.find((s: any) => s.id === bill.supplier_id)?.name || `Supplier #${bill.supplier_id}`;

          if (!groupedMap.has(itemId)) {
            groupedMap.set(itemId, {
              date: "Multiple",
              transaction_date: "Multiple",
              voucher_number: "Multiple",
              due_date: "Multiple",
              bill_no: "Multiple",
              custom_reference: "Multiple",
              supplier_name: new Set<string>(),
              item_name: itemName,
              hs_code: new Set<string>(),
              warehouse: "",
              quantity: 0,
              rate: "",
              discount: 0,
              tax: "",
              tax_amount: 0,
              tds_amount: 0,
              amount: 0,
              purchaser: "",
              department: "",
              project: "",
              segment: "",
              payment_mode: "",
              narration: "",
              remarks: "",
            });
          }

          const g = groupedMap.get(itemId);
          const qty = Number(l.quantity || 0);
          const rate = Number(l.rate || 0);
          const disc = Number(l.discount || 0);
          const taxRate = Number(l.tax_rate || 0);
          const base = qty * rate - disc;
          const tax = base * (taxRate / 100);
          const linesCount = bill.lines?.length || 1;
          const billTds = Number(bill.tds_amount || 0);
          const lineTds = bill.apply_tds ? billTds / linesCount : 0;

          g.quantity += qty;
          g.discount += disc;
          g.tax_amount += tax;
          g.tds_amount += lineTds;
          g.amount += base + tax;
          if (l.hs_code) g.hs_code.add(l.hs_code);
          g.supplier_name.add(supplierName);
        });
      }
    });

    return Array.from(groupedMap.values()).map((g: any) => ({
      ...g,
      supplier_name: Array.from(g.supplier_name).join(", "),
      hs_code: Array.from(g.hs_code).join(", "),
    }));
  }, [filtered, suppliers, items, purchasers, departments, projects, segments, paymentModes, isBS]);

  const grandTotal = useMemo(
    () => filtered.reduce((sum, bill) => sum + billTotal(bill), 0),
    [filtered]
  );

  const handleExportDetailedCsv = () => {
    if (!detailedRows.length) return;

    const exportCols = columnOrder.map(id => AVAILABLE_COLUMNS.find(c => c.id === id)!);
    const headers = exportCols.map(c => c.label);

    const csvRows = detailedRows.map(row => {
      return exportCols.map(c => {
        const val = row[c.id];
        return typeof val === "number" ? val.toFixed(2) : String(val ?? "");
      });
    });

    const csv = [headers, ...csvRows]
      .map((r) =>
        r
          .map((val) => {
            const s = String(val ?? "");
            if (s.includes(",") || s.includes("\"")) {
              return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchase-detailed-${companyId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcelDetailed = () => {
    if (!detailedRows.length) return;
    const exportCols = columnOrder.map(id => AVAILABLE_COLUMNS.find(c => c.id === id)!);
    
    const tableHTML = `
      <html xmlns:x="urn:schemas-microsoft-com:office:excel">
        <head><meta http-equiv="content-type" content="text/plain; charset=UTF-8"/></head>
        <body>
          <table border="1">
            <thead><tr>${exportCols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
            <tbody>
              ${detailedRows.map(row => {
                return `<tr>${exportCols.map(c => `<td>${row[c.id] ?? ""}</td>`).join('')}</tr>`;
              }).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
    const blob = new Blob([tableHTML], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchase-detailed-${companyId}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden select-none">
        <div className="h-[3px] w-full bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 opacity-60" />
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-5 py-3">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800/40 shadow-sm">
              <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-800 dark:text-slate-100 tracking-tight">Purchase Register</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Analyze your procurement performance and transaction details</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="group flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold shadow-sm transition-all active:scale-95"
            >
              <svg className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Back
            </button>
            <button
              type="button"
              onClick={() => router.push(`/companies/${companyId}`)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-transparent hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold shadow-sm transition-all active:scale-95"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Close
            </button>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-4 mt-1 flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1.5">
          <label className="block text-xs font-black uppercase tracking-wider text-slate-400">Calendar Mode</label>
          <select
            className="h-9 border border-emerald-500/20 rounded-xl px-3 text-xs bg-white dark:bg-slate-950 shadow-sm focus:ring-4 focus:ring-emerald-500/10 outline-none font-bold text-emerald-700 border-t-2 border-t-emerald-500 disabled:opacity-50 min-w-[150px]"
            value={effectiveDisplayMode}
            onChange={(e) => {
              const next = e.target.value as CalendarReportDisplayMode;
              setReportMode(next);
            }}
          >
            <option value="AD">AD (Gregorian)</option>
            <option value="BS">BS (Nepali)</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="block text-xs font-black uppercase tracking-wider text-slate-400">From Date</label>
          <Input
            type="date"
            calendarMode={effectiveDisplayMode}
            className="h-9 border border-slate-200 dark:border-slate-700 rounded-xl text-xs px-4 bg-white dark:bg-slate-950 focus:ring-4 focus:ring-emerald-500/10 transition-all w-44 outline-none font-medium"
            value={fromDate}
            min={initialCC?.fiscal_year_start || ""}
            max={initialCC?.fiscal_year_end || ""}
            onChange={(e) => {
              setFromDate(e.target.value);
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="block text-xs font-black uppercase tracking-wider text-slate-400">To Date</label>
          <Input
            type="date"
            calendarMode={effectiveDisplayMode}
            className="h-9 border border-slate-200 dark:border-slate-700 rounded-xl text-xs px-4 bg-white dark:bg-slate-950 focus:ring-4 focus:ring-emerald-500/10 transition-all w-44 outline-none font-medium"
            value={toDate}
            min={initialCC?.fiscal_year_start || ""}
            max={initialCC?.fiscal_year_end || ""}
            onChange={(e) => {
              setToDate(e.target.value);
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5 text-xs mt-4 md:mt-0">
          <button
            type="button"
            className="h-9 px-4 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold transition-all active:scale-95 shadow-sm"
            onClick={() => {
              if (initialCC?.fiscal_year_start && initialCC?.fiscal_year_end) {
                setFromDate(initialCC.fiscal_year_start);
                setToDate(initialCC.fiscal_year_end);
              } else {
                const { from, to } = getSmartDefaultPeriod("AD", initialCC);
                setFromDate(from);
                setToDate(to);
              }
            }}
          >
            Reset Dates
          </button>
        </div>
        <div className="flex flex-col gap-1.5 min-w-[150px]">
          <label className="block text-xs font-black uppercase tracking-wider text-slate-400">Supplier</label>
          <select
            className="h-9 border border-slate-200 dark:border-slate-700 rounded-xl px-4 text-xs bg-white dark:bg-slate-950 font-bold transition-all outline-none"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">All Suppliers</option>
            {suppliers?.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-black uppercase tracking-wider text-slate-400">Filter by Item Name</label>
          <input
            type="text"
            className="h-9 w-full border border-slate-200 dark:border-slate-700 rounded-xl text-xs px-4 bg-white dark:bg-slate-950 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none italic"
            placeholder="Search within items..."
            value={itemNameFilter}
            onChange={(e) => setItemNameFilter(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2 items-center ml-auto">
          <button
            type="button"
            className="h-9 w-10 flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-600 hover:bg-slate-50 shadow-sm transition-all active:scale-95"
            onClick={() => handlePrint(false)}
            disabled={reportType === "summary" ? !summaryRows.length : !detailedRows.length}
          >
            🖨️
          </button>
          
          <button
            type="button"
            className="h-9 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-black text-xs shadow-lg active:scale-95 transition-all disabled:opacity-50"
            onClick={handleExportExcelDetailed}
            disabled={!detailedRows.length}
          >
            .xls
          </button>
          <button
            type="button"
            className="h-9 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-lg active:scale-95 transition-all disabled:opacity-50 uppercase tracking-widest"
            onClick={handleExportDetailedCsv}
            disabled={!detailedRows.length}
          >
            Export Detailed
          </button>
        </div>
      </div>
      
      {/* Inline Column Toggle Pills Row */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm px-6 py-4 flex flex-col gap-4 animate-in fade-in slide-in-from-top-1 duration-500">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Visible Columns:</span>
                <button
                type="button"
                onClick={toggleAllColumns}
                className="px-3 py-1 rounded-lg text-[10px] font-black border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all active:scale-95 uppercase tracking-widest shadow-sm"
                >
                {isAllSelected ? "Deselect All" : "Select All"}
                </button>
            </div>
            <div className="flex items-center gap-6">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                   Transactions: <span className="text-slate-800 dark:text-slate-100 ml-1">{filtered.length}</span>
                </div>
                <div className="px-4 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800 text-xs font-black text-emerald-700 dark:text-emerald-300 shadow-inner">
                   Total Procurement: {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(grandTotal)}
                </div>
            </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_COLUMNS.map(col => (
            <button
              key={col.id}
              type="button"
              onClick={() => toggleColumn(col.id)}
              className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold border transition-all select-none shadow-sm ${visibleCols[col.id]
                  ? "bg-emerald-600 text-white border-emerald-600 scale-105"
                  : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-emerald-400 hover:text-emerald-600"
                }`}
            >
              {col.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-6" ref={printRef}>
        <div className="flex items-center justify-between mb-8 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 tracking-tighter uppercase italic">
              {reportType === "detailed" ? "Full Procurement Disclosure" : "Financial Summary"}
            </h2>
          </div>
          <div className="flex bg-slate-100/60 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner">
            <button
              onClick={() => setReportType("summary")}
              className={`px-6 py-2 rounded-lg text-xs font-black transition-all uppercase tracking-widest ${reportType === "summary" ? "bg-white dark:bg-slate-700 shadow-md text-emerald-600 dark:text-emerald-300" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"}`}
            >
              Summary
            </button>
            <button
              onClick={() => setReportType("detailed")}
              className={`px-6 py-2 rounded-lg text-xs font-black transition-all uppercase tracking-widest ${reportType === "detailed" ? "bg-white dark:bg-slate-700 shadow-md text-emerald-600 dark:text-emerald-300" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"}`}
            >
              Detailed
            </button>
          </div>
        </div>

        {reportType === "summary" && (
          summaryRows.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center gap-3 text-slate-400 opacity-60">
                 <div className="text-5xl">🔭</div>
                 <p className="text-sm font-medium italic">No summarized records match your current criteria.</p>
            </div>
          ) : (
            <div className="overflow-x-auto w-full rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-900 text-slate-200 border-b border-slate-800">
                    {columnOrder.map(colId => {
                      const col = AVAILABLE_COLUMNS.find(c => c.id === colId);
                      if (!col) return null;
                      const isNum = ["quantity", "rate", "discount", "tax", "tax_amount", "amount"].includes(col.id);
                      return (
                        <th key={col.id} className={`py-4 px-4 font-black tracking-widest uppercase text-[9px] whitespace-nowrap ${isNum ? "text-right" : "text-left"}`}>
                          {col.label}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800/60">
                  {summaryRows.map((row, idx) => (
                    <tr key={idx} className="transition-all hover:bg-emerald-50/40 dark:hover:bg-emerald-900/10 group">
                      {columnOrder.map(colId => {
                        const col = AVAILABLE_COLUMNS.find(c => c.id === colId);
                        if (!col) return null;
                        const val = (row as any)[col.id];
                        const isNumber = typeof val === "number";
                        return (
                          <td key={col.id} className={`py-3.5 px-4 text-slate-700 dark:text-slate-300 font-medium ${isNumber ? "text-right tabular-nums text-slate-900 dark:text-slate-100 font-black" : "group-hover:text-emerald-600 group-hover:dark:text-emerald-400"}`}>
                            {isNumber ? Number(val).toLocaleString(undefined, { minimumFractionDigits: 2 }) : val}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 dark:bg-slate-800/90 border-t-4 border-slate-200 dark:border-slate-700 font-black text-slate-900 dark:text-slate-100 italic">
                  <tr>
                    {columnOrder.map((colId, idx) => {
                      const col = AVAILABLE_COLUMNS.find(c => c.id === colId);
                      if (!col) return null;
                      if (col.id === "amount") {
                        const totalAmount = summaryRows.reduce((sum, r) => sum + (r.amount || 0), 0);
                        return <td key={col.id} className="py-4 px-4 text-right tabular-nums text-emerald-700 dark:text-emerald-400 border-l border-slate-100 dark:border-slate-700/50" title="Total Amount">{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>;
                      }
                      if (col.id === "quantity") {
                        const totalQty = summaryRows.reduce((sum, r) => sum + (r.quantity || 0), 0);
                        return <td key={col.id} className="py-4 px-4 text-right tabular-nums text-emerald-700 dark:text-emerald-400 border-l border-slate-100 dark:border-slate-700/50" title="Total Quantity">{totalQty.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>;
                      }
                      if (col.id === "tax_amount") {
                        const totalTax = summaryRows.reduce((sum, r) => sum + (r.tax_amount || 0), 0);
                        return <td key={col.id} className="py-4 px-4 text-right tabular-nums text-emerald-700 dark:text-emerald-400 border-l border-slate-100 dark:border-slate-700/50" title="Total Tax">{totalTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>;
                      }
                      if (col.id === "discount") {
                        const totalDisc = summaryRows.reduce((sum, r) => sum + (r.discount || 0), 0);
                        return <td key={col.id} className="py-4 px-4 text-right tabular-nums text-emerald-700 dark:text-emerald-400 border-l border-slate-100 dark:border-slate-700/50" title="Total Discount">{totalDisc.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>;
                      }
                      return <td key={col.id} className={`py-4 px-4 font-black text-[9px] uppercase tracking-widest text-slate-400 ${idx === 0 ? "" : "border-l border-slate-100 dark:border-slate-700/50"}`}>{idx === 0 ? "Purchase Totals" : ""}</td>;
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        )}

        {reportType === "detailed" && (
          detailedRows.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center gap-3 text-slate-400 opacity-60">
                 <div className="text-5xl">📄</div>
                 <p className="text-sm font-medium italic">No detailed records match your current criteria.</p>
            </div>
          ) : (
            <div className="overflow-x-auto w-full rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm border-separate border-spacing-0">
               <table className="w-full text-xs whitespace-nowrap">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-900 text-slate-100">
                      {columnOrder.map(colId => {
                        const col = AVAILABLE_COLUMNS.find(c => c.id === colId);
                        if (!col) return null;
                        const isNum = ["quantity", "rate", "discount", "tax", "tax_amount", "amount"].includes(col.id);
                        return (
                          <th key={col.id} className={`py-4 px-4 font-black tracking-widest uppercase text-[9px] border-b border-slate-800 ${isNum ? "text-right" : "text-left"}`}>
                            {col.label}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-900">
                    {detailedRows.map((row, idx) => (
                      <tr key={idx} className="transition-all hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 border-b border-slate-50 dark:border-slate-800/40 last:border-0 group">
                        {columnOrder.map(colId => {
                          const col = AVAILABLE_COLUMNS.find(c => c.id === colId);
                          if (!col) return null;
                          const val = row[col.id];
                          const isNumber = typeof val === "number";
                          return (
                            <td key={col.id} className={`py-3 px-4 text-slate-600 dark:text-slate-400 font-medium ${isNumber ? "text-right tabular-nums font-black text-slate-900 dark:text-slate-100" : "group-hover:text-emerald-600 transition-colors"}`}>
                              {isNumber ? Number(val).toLocaleString(undefined, { minimumFractionDigits: 2 }) : val}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-800 text-white font-black z-10 shadow-2xl relative">
                    <tr className="border-t border-slate-700">
                      {columnOrder.map((colId, idx) => {
                        const col = AVAILABLE_COLUMNS.find(c => c.id === colId);
                        if (!col) return null;
                        if (col.id === "amount") {
                          const totalAmt = detailedRows.reduce((sum, r) => sum + (r.amount || 0), 0);
                          return <td key={col.id} className="py-4 px-4 text-right tabular-nums text-emerald-400 text-base tracking-tighter border-l border-slate-700/50">{totalAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>;
                        }
                        if (col.id === "quantity") {
                          const totalQty = detailedRows.reduce((sum, r) => sum + (r.quantity || 0), 0);
                          return <td key={col.id} className="py-4 px-4 text-right tabular-nums border-l border-slate-700/50">{totalQty.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>;
                        }
                        if (col.id === "tax_amount") {
                          const totalTax = detailedRows.reduce((sum, r) => sum + (r.tax_amount || 0), 0);
                          return <td key={col.id} className="py-4 px-4 text-right tabular-nums border-l border-slate-700/50">{totalTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>;
                        }
                        if (col.id === "discount") {
                          const totalD = detailedRows.reduce((sum, r) => sum + (r.discount || 0), 0);
                          return <td key={col.id} className="py-4 px-4 text-right tabular-nums border-l border-slate-700/50">{totalD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>;
                        }
                        if (col.id === "tds_amount") {
                          const totalTds = detailedRows.reduce((sum, r) => sum + (r.tds_amount || 0), 0);
                          return <td key={col.id} className="py-4 px-4 text-right tabular-nums border-l border-slate-700/50 text-rose-400 font-black">{totalTds > 0 ? `-${totalTds.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-"}</td>;
                        }
                        return <td key={col.id} className={`py-4 px-4 font-black uppercase text-[9px] tracking-[0.2em] italic ${idx === 0 ? "text-emerald-400" : "border-l border-slate-700/50 text-transparent"}`}>
                          {idx === 0 ? "Cumulative Procurement Totals" : ""}
                        </td>;
                      })}
                    </tr>
                  </tfoot>
               </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
