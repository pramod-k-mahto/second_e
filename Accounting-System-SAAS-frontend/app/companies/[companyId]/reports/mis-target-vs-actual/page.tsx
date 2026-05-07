"use client";

import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, getCurrentCompany, getSmartDefaultPeriod, formatDateWithSuffix, type CurrentCompany } from "@/lib/api";
import { useMenuAccess } from "@/components/MenuPermissionsContext";
import {
    CalendarDisplayMode,
    CalendarReportDisplayMode,
    readCalendarDisplayMode,
    readCalendarReportDisplayMode,
    writeCalendarReportDisplayMode,
} from "@/lib/calendarMode";
import { openPrintWindow } from "@/lib/printReport";
import { safeADToBS, safeBSToAD, isIsoDateString } from "@/lib/bsad";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import { Input } from "@/components/ui/Input";
// Using native HTML selects for filter dropdowns

const fetcher = (url: string) => api.get(url).then((res) => res.data);

const toNepaliDigits = (num: number | string) => {
    const nepaliDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
    return num.toString().replace(/\d/g, (d) => nepaliDigits[parseInt(d, 10)]);
};

const toEnglishDigits = (num: number | string) => {
    const nepaliDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
    return num.toString().replace(/[०-९]/g, (d) => nepaliDigits.indexOf(d).toString());
};

const PrintStyles = () => (
    <style jsx global>{`
        @media print {
            @page {
                size: A4 landscape;
                margin: 10mm;
            }
            body {
                background: white !important;
                color: black !important;
            }
            .print\\:hidden {
                display: none !important;
            }
            .no-print {
                display: none !important;
            }
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            table {
                width: 100% !important;
                border-collapse: collapse !important;
                page-break-inside: auto;
            }
            tr {
                page-break-inside: avoid;
                page-break-after: auto;
            }
            thead {
                display: table-header-group;
            }
            tfoot {
                display: table-footer-group;
            }
            .sticky {
                position: static !important;
            }
            .overflow-x-auto {
                overflow: visible !important;
            }
            .shadow-sm, .shadow-md, .shadow-lg {
                shadow: none !important;
                box-shadow: none !important;
            }
            .border-slate-100, .border-slate-200 {
                border-color: #cbd5e1 !important;
            }
        }
    `}</style>
);

interface TargetVsActualRow {
    group_name: string;
    group_type: "TARGET" | "ACTUAL";
    ledger_name: string;
    month_key: string;
    amount: number;
    is_income?: boolean;
    dimension_name?: string;
}

export default function TargetVsActualReportPage() {
    const params = useParams();
    const companyId = params?.companyId as string;
    const router = useRouter();
    const printRef = useRef<HTMLDivElement | null>(null);

    const [mounted, setMounted] = useState(false);

    // Initialize state immediately from localStorage to prevent "AD date with BS label" flicker
    const initialCC = typeof window !== 'undefined' ? getCurrentCompany() : null;
    const initialMode = initialCC?.calendar_mode || "AD";
    const { from: initialFrom, to: initialTo } = getSmartDefaultPeriod(initialMode, initialCC);

    const [effectiveDisplayMode, setEffectiveDisplayMode] = useState<"AD" | "BS">(initialMode);
    const [fromDate, setFromDate] = useState(initialFrom);
    const [toDate, setToDate] = useState(initialTo);

    useEffect(() => {
        setMounted(true);
    }, []);

    const { data: dbCompany } = useSWR<CurrentCompany>(
        companyId ? `/companies/${companyId}` : null,
        fetcher
    );

    const cc = mounted ? getCurrentCompany() : initialCC;

    // Sync state if settings change or dbCompany loads
    useEffect(() => {
      if (mounted) {
        const activeCo = dbCompany || cc;
        if (activeCo) {
          if (activeCo.calendar_mode && activeCo.calendar_mode !== effectiveDisplayMode) {
            setEffectiveDisplayMode(activeCo.calendar_mode as any);
            const { from, to } = getSmartDefaultPeriod(activeCo.calendar_mode as any, activeCo);
            setFromDate(from);
            setToDate(to);
          }
        }
      }
    }, [mounted, dbCompany?.id, cc?.calendar_mode]);

    const [departmentFilter, setDepartmentFilter] = useState<string>("");
    const [projectFilter, setProjectFilter] = useState<string>("");
    const [segmentFilter, setSegmentFilter] = useState<string>("");

    const { data: currentUser } = useSWR(
        "/auth/me",
        fetcher
    );

    const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
    const [downloadFormat, setDownloadFormat] = useState<"PDF" | "CSV" | "XLS">("PDF");
    const [showReport, setShowReport] = useState(false);
    const [groupBy, setGroupBy] = useState<"" | "department" | "project" | "segment">("");
    const [viewType, setViewType] = useState<"detailed" | "summary" | "matrix-detailed" | "matrix-summary">("detailed");
    const [filterMode, setFilterMode] = useState<"MONTH" | "PERIOD">("MONTH");
    const [appliedParams, setAppliedParams] = useState<any>(null);

    const { data: companyInfo } = useSWR<{ fiscal_year_start?: string; fiscal_year_end?: string }>(
        companyId ? `/companies/${companyId}` : null,
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

    const { canRead } = useMenuAccess("reports.mis_target_vs_actual");

    const isBS = effectiveDisplayMode === "BS";
    const currentCompany = cc;
    // For legacy compatibility
    const dateDisplayMode = effectiveDisplayMode;



    const presetMonths = useMemo(() => {
        const result: { value: string, label: string }[] = [];
        const today = new Date();
        const todayAd = today.toISOString().slice(0, 10);

        let sY = today.getFullYear();
        let sM = 1;

        if (effectiveDisplayMode === "BS") {
            if (companyInfo?.fiscal_year_start) {
                let ts = companyInfo.fiscal_year_start;
                if (isIsoDateString(ts)) {
                    ts = safeADToBS(ts) || ts;
                }
                const parts = ts.split('-');
                if (parts.length >= 2) {
                    sY = parseInt(parts[0], 10);
                    const tempM = parseInt(parts[1], 10);
                    if (tempM >= 4) {
                        // FY year matches BS year
                    } else if (tempM >= 1 && tempM <= 3) {
                        // e.g. 2081-03-31 -> FY is 2081/82
                    }
                }
                sM = 4;
            } else {
                const todayBS = safeADToBS(todayAd) || "";
                const parts = todayBS.split('-');
                let currentBS_Y = 2080;
                let currentBS_M = 1;
                if (parts.length >= 2) {
                    currentBS_Y = parseInt(parts[0], 10);
                    currentBS_M = parseInt(parts[1], 10);
                }
                if (currentBS_M >= 4) {
                    sY = currentBS_Y;
                } else {
                    sY = currentBS_Y - 1;
                }
                sM = 4;
            }
        } else {
            if (companyInfo?.fiscal_year_start) {
                let ts = companyInfo.fiscal_year_start;
                if (!isIsoDateString(ts)) {
                    ts = safeBSToAD(ts) || ts;
                }
                const parts = ts.split('-');
                if (parts.length >= 2) {
                    sY = parseInt(parts[0], 10);
                    sM = parseInt(parts[1], 10);
                } else {
                    sM = 1;
                }
            } else {
                sY = today.getFullYear();
                sM = 1;
            }
        }

        let currentY = sY;
        let currentM = sM;

        for (let i = 0; i < 12; i++) {
            const monthStr = currentM.toString().padStart(2, "0");
            const val = `${currentY}-${monthStr}`;
            let label = val;

            if (effectiveDisplayMode === "BS") {
                const bsMonths = ["वैशाख", "जेठ", "असार", "साउन", "भदौ", "असोज", "कात्तिक", "मंसिर", "पुस", "माघ", "फागुन", "चैत"];
                label = `${bsMonths[currentM - 1]} ${toNepaliDigits(currentY)}`;
            } else {
                const adMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                label = `${adMonths[currentM - 1]} ${currentY}`;
            }

            result.push({ value: val, label });

            currentM++;
            if (currentM > 12) {
                currentM = 1;
                currentY++;
            }
        }

        return result;
    }, [companyInfo, effectiveDisplayMode]);

    // Clear selected months only when display mode actually changes
    const prevDisplayModeRef = useRef(effectiveDisplayMode);
    useEffect(() => {
        if (prevDisplayModeRef.current !== effectiveDisplayMode) {
            prevDisplayModeRef.current = effectiveDisplayMode;
            setSelectedMonths([]);
            setFromDate("");
            setToDate("");
        }
    }, [effectiveDisplayMode]);


    const computeDatesFromMonths = (months: string[]) => {
        if (months.length === 0) return;
        const sorted = [...months].sort();
        const startMonthVal = sorted[0];
        const endMonthVal = sorted[sorted.length - 1];

        const firstDay = `${startMonthVal}-01`;
        let lastDay = `${endMonthVal}-30`;

        if (effectiveDisplayMode !== "BS") {
            const [yStr, mStr] = endMonthVal.split('-');
            const y = parseInt(yStr, 10);
            const m = parseInt(mStr, 10);
            const dDate = new Date(y, m, 0);
            lastDay = `${y}-${mStr}-${dDate.getDate().toString().padStart(2, "0")}`;
        } else {
            const [yStr, mStr] = endMonthVal.split('-');
            const mStrPad = mStr.padStart(2, '0');
            for (let d = 32; d >= 29; d--) {
                const testVal = `${yStr}-${mStrPad}-${d.toString().padStart(2, '0')}`;
                if (safeBSToAD(testVal) !== '') {
                    lastDay = testVal;
                    break;
                }
            }
        }

        if (effectiveDisplayMode === "BS") {
            setFromDate(isBS ? firstDay : safeBSToAD(firstDay) || "");
            setToDate(isBS ? lastDay : safeBSToAD(lastDay) || "");
        } else {
            setFromDate(isBS ? safeADToBS(firstDay) || "" : firstDay);
            setToDate(isBS ? safeADToBS(lastDay) || "" : lastDay);
        }
    };

    const handleMonthToggle = (val: string) => {
        let next: string[];
        if (val === "ALL") {
            if (selectedMonths.length === presetMonths.length) {
                next = [];
            } else {
                next = presetMonths.map(p => p.value);
            }
        } else {
            next = selectedMonths.includes(val)
                ? selectedMonths.filter(m => m !== val)
                : [...selectedMonths, val];
        }
        setSelectedMonths(next);
    };

    const computeMonthsFromDates = (from: string, to: string) => {
        if (!from || !to) return;
        const fromParts = from.split("-");
        const toParts = to.split("-");
        if (fromParts.length < 2 || toParts.length < 2) return;

        const fromKey = `${fromParts[0]}-${fromParts[1]}`;
        const toKey = `${toParts[0]}-${toParts[1]}`;

        const matched = presetMonths
            .map(p => p.value)
            .filter(v => v >= fromKey && v <= toKey);

        if (matched.length > 0) {
            setSelectedMonths(matched);
        }
    };

    const handleCustomFromDate = (val: string) => {
        setFromDate(val);
    };

    const handleCustomToDate = (val: string) => {
        setToDate(val);
    };

    // Helper: get department/project label for display
    const selectedDeptName = useMemo(() => {
        if (!departmentFilter || !Array.isArray(departments)) return "";
        const d = departments.find((x: any) => String(x.id) === String(departmentFilter));
        return d ? d.name : "";
    }, [departmentFilter, departments]);

    const selectedProjName = useMemo(() => {
        if (!projectFilter || !Array.isArray(projects)) return "";
        const p = projects.find((x: any) => String(x.id) === String(projectFilter));
        return p ? p.name : "";
    }, [projectFilter, projects]);

    const selectedSegName = useMemo(() => {
        if (!segmentFilter || !Array.isArray(segments)) return "";
        const s = segments.find((x: any) => String(x.id) === String(segmentFilter));
        return s ? s.name : "";
    }, [segmentFilter, segments]);

    const handleShow = () => {
        let f = fromDate, t = toDate;
        if (filterMode === "MONTH") {
            if (selectedMonths.length === 0) return;
            const sorted = [...selectedMonths].sort();
            const startMonthVal = sorted[0];
            const endMonthVal = sorted[sorted.length - 1];
            const firstDay = `${startMonthVal}-01`;
            let lastDay = `${endMonthVal}-30`;
            if (effectiveDisplayMode !== "BS") {
                const [yStr, mStr] = endMonthVal.split('-');
                const dDate = new Date(parseInt(yStr), parseInt(mStr), 0);
                lastDay = `${yStr}-${mStr}-${dDate.getDate().toString().padStart(2, "0")}`;
            } else {
                const [yStr, mStr] = endMonthVal.split('-');
                for (let d = 32; d >= 29; d--) {
                    const testVal = `${yStr}-${mStr.padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
                    if (safeBSToAD(testVal) !== '') { lastDay = testVal; break; }
                }
            }
            if (effectiveDisplayMode === "BS") {
                f = isBS ? firstDay : safeBSToAD(firstDay) || "";
                t = isBS ? lastDay : safeBSToAD(lastDay) || "";
            } else {
                f = isBS ? safeADToBS(firstDay) || "" : firstDay;
                t = isBS ? safeADToBS(lastDay) || "" : lastDay;
            }
            setFromDate(f); setToDate(t);
        } else {
            if (!f || !t) return;
        }

        const fromAD = isBS ? safeBSToAD(f) : f;
        const toAD = isBS ? safeBSToAD(t) : t;

        setAppliedParams({
            fromAD, toAD, departmentFilter, projectFilter, segmentFilter, groupBy, viewType, effectiveDisplayMode
        });
        setShowReport(true);
    };

    const handleToday = () => {
        const { from, to } = getSmartDefaultPeriod(effectiveDisplayMode, currentCompany);
        setFromDate(from);
        setToDate(to);

        // Handle month selection for matrix view
        computeMonthsFromDates(from, to);
        setShowReport(true);
    };

    const handleReset = () => {
        setDepartmentFilter(""); setProjectFilter(""); setSegmentFilter(""); setGroupBy(""); setViewType("detailed");
        setFromDate(""); setToDate(""); setSelectedMonths([]); setShowReport(false);
        setAppliedParams(null);
    };

    const reportUrl = useMemo(() => {
        if (!companyId || !appliedParams) return null;
        const { fromAD, toAD, departmentFilter: dep, projectFilter: prj, groupBy: grp, effectiveDisplayMode: eff } = appliedParams;
        
        let url = `/companies/${companyId}/reports/mis-target-vs-actual?from_date=${fromAD}&to_date=${toAD}&calendar_mode=${eff}`;
        if (dep) url += `&department_id=${dep}`;
        if (prj) url += `&project_id=${prj}`;
        if (segmentFilter) url += `&segment_id=${segmentFilter}`;
        if (grp) url += `&group_by=${grp}`;
        return url;
    }, [companyId, appliedParams]);

    const { data: reportData, error: reportError, mutate } = useSWR<{ data: TargetVsActualRow[] }>(
        reportUrl,
        fetcher
    );

    const reportSubtitle = useMemo(() => {
        if (groupBy === "department") return selectedDeptName ? `Department: ${selectedDeptName}` : "All Departments (Department-wise)";
        if (groupBy === "project") return selectedProjName ? `Project: ${selectedProjName}` : "All Projects (Project-wise)";
        if (groupBy === "segment") return selectedSegName ? `Segment: ${selectedSegName}` : "All Segments (Segment-wise)";
        if (selectedDeptName) return `Department: ${selectedDeptName}`;
        if (selectedProjName) return `Project: ${selectedProjName}`;
        if (selectedSegName) return `Segment: ${selectedSegName}`;
        return "";
    }, [groupBy, selectedDeptName, selectedProjName, selectedSegName]);

    const mappedData = useMemo(() => {
        const monthList = Array.from(selectedMonths).sort();

        const formatMonth = (key: string) => {
            const parts = key.split("-");
            if (parts.length !== 2) return key;
            const mIdx = parseInt(parts[1], 10) - 1;
            const y = parts[0];

            if (effectiveDisplayMode === "BS") {
                const bsMonths = ["वैशाख", "जेठ", "असार", "साउन", "भदौ", "असोज", "कात्तिक", "मंसिर", "पुस", "माघ", "फागुन", "चैत"];
                return `${bsMonths[mIdx]} ${toNepaliDigits(y)}`;
            } else {
                const adMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                return `${adMonths[mIdx]} ${y}`;
            }
        };

        const monthCols = monthList.map(m => ({
            key: m,
            label: formatMonth(m)
        }));

        if (!showReport || !reportData?.data) {
            return {
                months: monthCols,
                rows: { income: { target: [], actual: [] }, expense: { target: [], actual: [] } },
                totals: { INCOME_TARGET: {}, INCOME_ACTUAL: {}, EXPENSE_TARGET: {}, EXPENSE_ACTUAL: {}, NET: {}, OVERALL: { it: 0, ia: 0, et: 0, ea: 0 } }
            };
        }

        // Groups nested as: Category -> Group -> Ledger -> Month -> Amount
        const storage: Record<"INCOME" | "EXPENSE", Record<"TARGET" | "ACTUAL", Record<string, Record<string, Record<string, number>>>>> = {
             INCOME: { TARGET: {}, ACTUAL: {} },
             EXPENSE: { TARGET: {}, ACTUAL: {} }
        };

        const totals = {
            INCOME_TARGET: {} as Record<string, number>,
            INCOME_ACTUAL: {} as Record<string, number>,
            EXPENSE_TARGET: {} as Record<string, number>,
            EXPENSE_ACTUAL: {} as Record<string, number>,
            NET: {} as Record<string, number>, // Income - Expense
            OVERALL: { it: 0, ia: 0, et: 0, ea: 0 }
        };

        monthList.forEach(m => {
            totals.INCOME_TARGET[m] = 0;
            totals.INCOME_ACTUAL[m] = 0;
            totals.EXPENSE_TARGET[m] = 0;
            totals.EXPENSE_ACTUAL[m] = 0;
            totals.NET[m] = 0;
        });

        reportData.data.forEach((item: TargetVsActualRow) => {
            const cat = item.is_income ? "INCOME" : "EXPENSE";
            const gType = item.group_type;
            
            if (!storage[cat][gType][item.group_name]) storage[cat][gType][item.group_name] = {};
            if (!storage[cat][gType][item.group_name][item.ledger_name]) storage[cat][gType][item.group_name][item.ledger_name] = {};
            
            if (!storage[cat][gType][item.group_name][item.ledger_name][item.month_key]) {
                storage[cat][gType][item.group_name][item.ledger_name][item.month_key] = 0;
            }
            storage[cat][gType][item.group_name][item.ledger_name][item.month_key] += item.amount;

            // Totals
            const tKey = `${cat}_${gType}` as keyof typeof totals;
            if (totals[tKey] === undefined) (totals as any)[tKey] = {};
            if ((totals[tKey] as any)[item.month_key] === undefined) (totals[tKey] as any)[item.month_key] = 0;
            (totals[tKey] as any)[item.month_key] += item.amount;
            
            const overallKey = (cat === "INCOME" ? (gType === "TARGET" ? "it" : "ia") : (gType === "TARGET" ? "et" : "ea")) as keyof typeof totals.OVERALL;
            totals.OVERALL[overallKey] += item.amount;
        });

        // Compute NET totals per month
        monthList.forEach(m => {
            totals.NET[m] = (totals.INCOME_ACTUAL[m] || 0) - (totals.EXPENSE_ACTUAL[m] || 0);
        });

        const buildBlock = (groups: Record<string, Record<string, Record<string, number>>>) => {
            const result = [];
            for (const groupName in groups) {
                const ledgers = [];
                let groupTotal = 0;
                const groupMonthly = {} as Record<string, number>;
                monthList.forEach(m => groupMonthly[m] = 0);

                for (const ledgerName in groups[groupName]) {
                    const rowMonthly = groups[groupName][ledgerName];
                    let ledgerTotal = 0;
                    for (const m of monthList) {
                        const amt = rowMonthly[m] || 0;
                        ledgerTotal += amt;
                        groupMonthly[m] += amt;
                    }
                    groupTotal += ledgerTotal;
                    ledgers.push({ name: ledgerName, monthly: rowMonthly, total: ledgerTotal });
                }
                result.push({ name: groupName, ledgers: ledgers.sort((a, b) => b.total - a.total), monthly: groupMonthly, total: groupTotal });
            }
            return result.sort((a, b) => b.total - a.total);
        };

        return {
            months: monthCols,
            rows: {
                income: { target: buildBlock(storage.INCOME.TARGET), actual: buildBlock(storage.INCOME.ACTUAL) },
                expense: { target: buildBlock(storage.EXPENSE.TARGET), actual: buildBlock(storage.EXPENSE.ACTUAL) }
            },
            totals
        };
    }, [reportData, effectiveDisplayMode, selectedMonths, showReport]);

    // ------------------------------------------------------------------ //
    // Dimension-wise data (department / project)                          //
    // ------------------------------------------------------------------ //
    const dimensionData = useMemo(() => {
        if (!showReport || !groupBy || !reportData?.data || selectedMonths.length === 0) return null;

        const monthList = Array.from(selectedMonths).sort();

        const formatMonth = (key: string) => {
            const parts = key.split("-");
            if (parts.length !== 2) return key;
            const mIdx = parseInt(parts[1], 10) - 1;
            const y = parts[0];
            if (effectiveDisplayMode === "BS") {
                const bsMonths = ["वैशाख", "जेठ", "असार", "साउन", "भदौ", "असोज", "कात्तिक", "मंसिर", "पुस", "माघ", "फागुन", "चैत"];
                return `${bsMonths[mIdx]} ${toNepaliDigits(y)}`;
            } else {
                const adMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                return `${adMonths[mIdx]} ${y}`;
            }
        };

        const monthCols = monthList.map(m => ({ key: m, label: formatMonth(m) }));

        // Collect all dimension names
        const dimSet = new Set<string>();
        reportData.data.forEach((item: TargetVsActualRow) => {
            // if (selectedMonths.includes(item.month_key)) {
            let label = "(No Dimension)";
            if (groupBy === "department") label = `(No Department)`;
            else if (groupBy === "project") label = `(No Project)`;
            else if (groupBy === "segment") label = `(No Segment)`;

            dimSet.add(item.dimension_name || label);
            // }
        });
        const dimensions = Array.from(dimSet).sort();


        // For each dimension: target, actual, net (variance)
        const dimMap: Record<string, { 
            target: Record<string, number>; 
            actual: Record<string, number>; 
            net: Record<string, number>; 
            totalTarget: number; 
            totalActual: number; 
            totalNet: number 
        }> = {};

        dimensions.forEach(dim => {
            dimMap[dim] = {
                target: Object.fromEntries(monthList.map(m => [m, 0])),
                actual: Object.fromEntries(monthList.map(m => [m, 0])),
                net: Object.fromEntries(monthList.map(m => [m, 0])),
                totalTarget: 0,
                totalActual: 0,
                totalNet: 0,
            };
        });

        // Overall totals per month
        const overallTarget: Record<string, number> = Object.fromEntries(monthList.map(m => [m, 0]));
        const overallActual: Record<string, number> = Object.fromEntries(monthList.map(m => [m, 0]));
        const overallNet: Record<string, number> = Object.fromEntries(monthList.map(m => [m, 0]));
        let grandTarget = 0, grandActual = 0, grandNet = 0;

        reportData.data.forEach((item: TargetVsActualRow) => {
            let label = "(No Dimension)";
            if (groupBy === "department") label = `(No Department)`;
            else if (groupBy === "project") label = `(No Project)`;
            else if (groupBy === "segment") label = `(No Segment)`;
            
            const dim = item.dimension_name || label;
            if (!dimMap[dim]) return;

            if (item.group_type === "TARGET") {
                dimMap[dim].target[item.month_key] = (dimMap[dim].target[item.month_key] || 0) + item.amount;
                dimMap[dim].totalTarget += item.amount;
                dimMap[dim].net[item.month_key] -= item.amount; // net = Actual - Target
                dimMap[dim].totalNet -= item.amount;
                overallTarget[item.month_key] += item.amount;
                overallNet[item.month_key] -= item.amount;
                grandTarget += item.amount;
                grandNet -= item.amount;
            } else {
                dimMap[dim].actual[item.month_key] = (dimMap[dim].actual[item.month_key] || 0) + item.amount;
                dimMap[dim].totalActual += item.amount;
                dimMap[dim].net[item.month_key] += item.amount; // net = Actual - Target
                dimMap[dim].totalNet += item.amount;
                overallActual[item.month_key] += item.amount;
                overallNet[item.month_key] += item.amount;
                grandActual += item.amount;
                grandNet += item.amount;
            }
        });

        // Sort dimensions by totalNet desc (best performing first)
        dimensions.sort((a, b) => (dimMap[b]?.totalNet ?? 0) - (dimMap[a]?.totalNet ?? 0));

        return {
            months: monthCols,
            dimensions,
            dimMap,
            overallTarget,
            overallActual,
            overallNet,
            grandTarget,
            grandActual,
            grandNet,
        };
    }, [reportData, effectiveDisplayMode, selectedMonths, showReport, groupBy]);
    
    // ------------------------------------------------------------------ //
    // Matrix Data (Pivoted by Department)                                 //
    // ------------------------------------------------------------------ //
    const matrixData = useMemo(() => {
        if (!showReport || !reportData?.data || selectedMonths.length === 0) return null;

        // Collect all dimension names (Departments)
        const dimSet = new Set<string>();
        reportData.data.forEach((item: TargetVsActualRow) => {
            let label = "(No Dimension)";
            if (groupBy === "department") label = "(No Department)";
            else if (groupBy === "project") label = "(No Project)";
            else if (groupBy === "segment") label = "(No Segment)";
            
            dimSet.add(item.dimension_name || label);
        });
        const dimensions = Array.from(dimSet).sort();

        // Rows for the matrix: Focused on Income/Revenue primarily
        const incomeRows: Record<string, { 
            name: string; 
            cells: Record<string, { target: number, actual: number }> 
        }> = {};
        
        const expenseRows: Record<string, { 
            name: string; 
            cells: Record<string, { target: number, actual: number }> 
        }> = {};
        
        const deptTotals: Record<string, { target: number, actual: number }> = {};
        dimensions.forEach(d => deptTotals[d] = { target: 0, actual: 0 });

        reportData.data.forEach((item: TargetVsActualRow) => {
            let label = "(No Dimension)";
            if (groupBy === "department") label = "(No Department)";
            else if (groupBy === "project") label = "(No Project)";
            else if (groupBy === "segment") label = "(No Segment)";
            
            const dim = item.dimension_name || label;
            const rowStorage = item.is_income ? incomeRows : expenseRows;
            const ledgerKey = item.ledger_name;

            if (!rowStorage[ledgerKey]) {
                rowStorage[ledgerKey] = { 
                    name: ledgerKey, 
                    cells: Object.fromEntries(dimensions.map(d => [d, { target: 0, actual: 0 }]))
                };
            }

            if (item.group_type === "TARGET") {
                rowStorage[ledgerKey].cells[dim].target += item.amount;
                if (item.is_income) deptTotals[dim].target += item.amount;
                else deptTotals[dim].target -= item.amount; // For Net Calculation
            } else {
                rowStorage[ledgerKey].cells[dim].actual += item.amount;
                if (item.is_income) deptTotals[dim].actual += item.amount;
                else deptTotals[dim].actual -= item.amount; // For Net Calculation
            }
        });

        return {
            dimensions,
            incomeRows: Object.values(incomeRows).sort((a,b) => b.name.localeCompare(a.name)),
            expenseRows: Object.values(expenseRows).sort((a,b) => b.name.localeCompare(a.name)),
            deptTotals
        };
    }, [reportData, selectedMonths, showReport]);


    // Deprecated handlers replaced by standardized getSmartDefaultPeriod and direct setters

    const renderCategorySection = (title: string, data: { target: any[], actual: any[] }, isIncome: boolean) => {
        const bgHead = isIncome ? "bg-emerald-50 dark:bg-emerald-950/40" : "bg-red-50 dark:bg-red-950/40";
        const textHead = isIncome ? "text-emerald-800 dark:text-emerald-300" : "text-red-800 dark:text-red-300";
        const dotColor = isIncome ? "bg-emerald-500" : "bg-red-500";
        
        const totTargetKey = isIncome ? "INCOME_TARGET" : "EXPENSE_TARGET";
        const totActualKey = isIncome ? "INCOME_ACTUAL" : "EXPENSE_ACTUAL";
        const overallTarget = isIncome ? mappedData.totals.OVERALL.it : mappedData.totals.OVERALL.et;
        const overallActual = isIncome ? mappedData.totals.OVERALL.ia : mappedData.totals.OVERALL.ea;

        return (
            <>
                <tr className={`${bgHead} border-b-2 border-slate-300 dark:border-slate-700`}>
                    <td className={`py-3 px-3 font-black ${textHead} uppercase flex items-center gap-2 sticky left-0 ${bgHead} z-10 border-r border-slate-300`}>
                        <span className={`w-2.5 h-2.5 rounded-full ${dotColor} animate-pulse`} />
                        {title} PERFORMANCE
                    </td>
                    <td colSpan={mappedData.months.length + 1}></td>
                </tr>

                {data.actual.map((group, gIdx) => (
                    <React.Fragment key={`${title}_g_${gIdx}`}>
                        {/* Group Header Row */}
                        <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                            <td className="py-2 px-3 font-bold text-slate-800 dark:text-slate-200 sticky left-0 bg-slate-50 dark:bg-slate-900 z-10 border-r border-slate-300">
                                {group.name}
                            </td>
                            {mappedData.months.map(m => {
                                const tGroup = data.target.find(tg => tg.name === group.name);
                                const tAmt = tGroup ? (tGroup.monthly[m.key] || 0) : 0;
                                const aAmt = group.monthly[m.key] || 0;
                                const variance = aAmt - tAmt;
                                // For Income: Actual > Target is GOOD (+). For Expense: Actual > Target is BAD (+).
                                const isPositiveResult = isIncome ? variance >= 0 : variance <= 0;
                                const pct = tAmt !== 0 ? ((variance / Math.abs(tAmt)) * 100) : null;

                                return (
                                    <td key={`${title}_g_${gIdx}_${m.key}`} className="py-2 px-3 text-right border-r border-slate-200">
                                        <div className="font-bold text-slate-900 dark:text-slate-100">{formatNumber(aAmt)}</div>
                                        <div className={`text-[10px] font-medium mt-0.5 ${variance === 0 ? 'text-slate-400' : isPositiveResult ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                                            {variance > 0 ? '+' : ''}{formatNumber(variance)} 
                                            <span className="opacity-70 ml-1">({pct !== null ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : '—'})</span>
                                        </div>
                                    </td>
                                );
                            })}
                            <td className="py-2 px-3 text-right bg-slate-100/50 dark:bg-slate-800/50">
                                {(() => {
                                    const tGroup = data.target.find(tg => tg.name === group.name);
                                    const tTotal = tGroup ? tGroup.total : 0;
                                    const variance = group.total - tTotal;
                                    const isPositiveResult = isIncome ? variance >= 0 : variance <= 0;
                                    const pct = tTotal !== 0 ? ((variance / Math.abs(tTotal)) * 100) : null;
                                    return (
                                        <>
                                            <div className="font-black text-slate-900 dark:text-slate-100">{formatNumber(group.total)}</div>
                                            <div className={`text-[10px] font-bold mt-0.5 ${variance === 0 ? 'text-slate-400' : isPositiveResult ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                                                {variance > 0 ? '+' : ''}{formatNumber(variance)} 
                                                <span className="opacity-70 ml-1">({pct !== null ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : '—'})</span>
                                            </div>
                                        </>
                                    );
                                })()}
                            </td>
                        </tr>

                        {/* Detailed Ledgers */}
                        {viewType === "detailed" && group.ledgers.map((l: any, lIdx: number) => (
                            <tr key={`${title}_l_${gIdx}_${lIdx}`} className="border-b border-slate-200 dark:border-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                                <td className="py-1.5 px-3 pl-8 text-xs text-slate-600 dark:text-slate-400 sticky left-0 bg-white dark:bg-slate-950/95 z-10 border-r-2 border-slate-200 font-medium">
                                    {l.name}
                                </td>
                                {mappedData.months.map(m => {
                                    const tGroup = data.target.find(tg => tg.name === group.name);
                                    const tLedger = tGroup?.ledgers.find((tl: any) => tl.name === l.name);
                                    const tAmt = tLedger ? (tLedger.monthly[m.key] || 0) : 0;
                                    const aAmt = l.monthly[m.key] || 0;
                                    const variance = aAmt - tAmt;
                                    const isPositiveResult = isIncome ? variance >= 0 : variance <= 0;
                                    const pct = tAmt !== 0 ? ((variance / Math.abs(tAmt)) * 100) : null;

                                    return (
                                        <td key={`${title}_l_${gIdx}_${lIdx}_${m.key}`} className="py-1.5 px-3 text-right border-r border-slate-200">
                                            <div className="font-mono text-slate-700 dark:text-slate-300">{formatNumber(aAmt)}</div>
                                            {tAmt !== 0 && (
                                                <div className={`text-[9px] font-medium ${isPositiveResult ? 'text-green-500' : 'text-red-400'}`}>
                                                    {variance > 0 ? '+' : ''}{formatNumber(variance)} ({pct?.toFixed(0)}%)
                                                </div>
                                            )}
                                        </td>
                                    );
                                })}
                                <td className="py-1.5 px-3 text-right bg-slate-50/30 dark:bg-slate-900/30">
                                    <div className="font-mono font-bold text-slate-800 dark:text-slate-200">{formatNumber(l.total)}</div>
                                </td>
                            </tr>
                        ))}
                    </React.Fragment>
                ))}

                {/* Sub-total row for the Category */}
                <tr className={`${bgHead} border-t-2 border-slate-300 dark:border-slate-700 font-bold`}>
                    <td className={`py-2.5 px-3 uppercase tracking-wider sticky left-0 ${bgHead} z-10 border-r-2 border-slate-300`}>
                        TOTAL {title} (ACTUAL)
                    </td>
                    {mappedData.months.map(m => {
                        const a = (mappedData.totals as any)[totActualKey][m.key] || 0;
                        const t = (mappedData.totals as any)[totTargetKey][m.key] || 0;
                        const variance = a - t;
                        const isPositiveResult = isIncome ? variance >= 0 : variance <= 0;
                        return (
                            <td key={`${title}_tot_${m.key}`} className="py-2.5 px-3 text-right border-r border-slate-200">
                                <div className={textHead}>{formatNumber(a)}</div>
                                {t !== 0 && (
                                    <div className={`text-[10px] ${isPositiveResult ? 'text-green-600' : 'text-red-500'}`}>
                                        Target: {formatNumber(t)}
                                    </div>
                                )}
                            </td>
                        );
                    })}
                    <td className={`py-2.5 px-3 text-right ${textHead} text-lg font-black bg-slate-100/30`}>
                        {formatNumber(overallActual)}
                    </td>
                </tr>
            </>
        );
    };

    const renderMatrixDetailedView = () => {
        if (!matrixData) return null;
        const { dimensions, incomeRows, expenseRows, deptTotals } = matrixData;

        return (
            <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse table-fixed min-w-[1000px]">
                    <thead>
                        <tr className="bg-slate-50 border-y border-slate-200 text-slate-500 font-bold uppercase text-[9px] tracking-widest">
                            <th className="p-3 text-left sticky left-0 bg-slate-50 z-20 border-r border-slate-200 w-[250px]">Sales Items (Ledgers)</th>
                            {dimensions.map(d => (
                                <th key={d} className="p-3 text-center border-l border-slate-100 min-w-[120px]">{d}</th>
                            ))}
                            <th className="p-3 text-right bg-slate-100 border-l border-slate-200 w-[120px]">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {/* Revenue Section */}
                        <tr className="bg-emerald-50/50">
                            <td className="p-3 font-black text-emerald-800 uppercase sticky left-0 bg-emerald-50/50 z-10 border-r border-slate-200">Revenue Performance</td>
                            <td colSpan={dimensions.length + 1}></td>
                        </tr>
                        {incomeRows.map(row => {
                            let rowTotal = 0;
                            return (
                                <tr key={row.name} className="hover:bg-slate-50 border-b border-slate-200 transition-colors">
                                    <td className="p-2.5 px-3 text-slate-700 font-semibold sticky left-0 bg-white z-10 border-r border-slate-200 truncate">{row.name}</td>
                                    {dimensions.map(d => {
                                        const cell = row.cells[d];
                                        rowTotal += cell.actual;
                                        const variance = cell.actual - cell.target;
                                        const pct = cell.target !== 0 ? (variance / Math.abs(cell.target)) * 100 : null;
                                        return (
                                            <td key={d} className="p-2 text-center border-r border-slate-200">
                                                <div className="font-bold text-slate-900">{formatNumber(cell.actual)}</div>
                                                {cell.target !== 0 && (
                                                    <div className={`text-[8px] font-medium ${variance >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                        {variance > 0 ? '+' : ''}{formatNumber(variance)}
                                                        {pct !== null && <span className="opacity-70 ml-0.5">({pct.toFixed(0)}%)</span>}
                                                    </div>
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td className="p-2 text-right font-black text-slate-900 bg-slate-50/30 border-l border-slate-300">{formatNumber(rowTotal)}</td>
                                </tr>
                            );
                        })}

                        {/* Summary Bottom Row for Matrix Detailed */}
                        <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold">
                            <td className="p-3 sticky left-0 bg-slate-100 font-black text-[10px] uppercase tracking-wider z-10 border-r border-slate-300">Net Position (Actual)</td>
                            {dimensions.map(d => (
                                <td key={`tot_${d}`} className={`p-3 text-center ${deptTotals[d].actual < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                                    {formatNumber(deptTotals[d].actual)}
                                </td>
                            ))}
                            <td className="p-3 text-right bg-slate-200 font-black text-indigo-700">
                                {formatNumber(Object.values(deptTotals).reduce((sum, curr) => sum + curr.actual, 0))}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    };

    const renderMatrixSummaryView = () => {
        if (!matrixData) return null;
        const { dimensions, deptTotals } = matrixData;

        return (
            <div className="max-w-4xl mx-auto">
                <table className="w-full text-xs border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-y border-slate-200 text-slate-500 font-bold uppercase text-[9px] tracking-widest">
                            <th className="p-4 text-left border-r border-slate-200">Department / Dimension</th>
                            <th className="p-4 text-right">Target</th>
                            <th className="p-4 text-right">Actual</th>
                            <th className="p-4 text-right">Variance</th>
                            <th className="p-4 text-right bg-indigo-50/30 text-indigo-700">% Performance</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {dimensions.map(d => {
                            const stats = deptTotals[d];
                            const variance = stats.actual - stats.target;
                            const pct = stats.target !== 0 ? (stats.actual / Math.abs(stats.target)) * 100 : null;
                            const isPositive = stats.actual >= stats.target;

                            return (
                                <tr key={d} className="hover:bg-slate-50 transition-colors group border-b border-slate-200">
                                    <td className="p-4 font-bold text-slate-700 border-r border-slate-200">{d}</td>
                                    <td className="p-4 text-right font-mono text-slate-400 border-r border-slate-200">{formatNumber(stats.target)}</td>
                                    <td className="p-4 text-right font-bold text-slate-900 border-r border-slate-200">{formatNumber(stats.actual)}</td>
                                    <td className={`p-4 text-right font-bold border-r border-slate-200 ${isPositive ? 'text-emerald-600' : 'text-rose-500'}`}>
                                        {variance > 0 ? '+' : ''}{formatNumber(variance)}
                                    </td>
                                    <td className="p-4 text-right bg-slate-50/30 font-black text-indigo-600">
                                        {pct !== null ? (
                                            <div className="flex items-center justify-end gap-2">
                                                <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden hidden md:block">
                                                    <div 
                                                        className={`h-full transition-all duration-500 ${isPositive ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                                        style={{ width: `${Math.min(pct, 100)}%` }}
                                                    />
                                                </div>
                                                <span className={`font-black ${isPositive ? 'text-emerald-700' : 'text-rose-600'}`}>
                                                    {pct.toFixed(1)}%
                                                </span>
                                            </div>
                                        ) : "—"}
                                    </td>
                                </tr>
                            );
                        })}
                        <tr className="bg-slate-100 border-t-2 border-slate-300 font-black text-slate-800">
                            <td className="p-4 uppercase tracking-widest text-[10px]">Grand Consolidated Total</td>
                            <td className="p-4 text-right">{formatNumber(Object.values(deptTotals).reduce((s,c) => s + c.target, 0))}</td>
                            <td className="p-4 text-right">{formatNumber(Object.values(deptTotals).reduce((s,c) => s + c.actual, 0))}</td>
                            <td className="p-4 text-right" colSpan={2}>
                                {(() => {
                                    const t = Object.values(deptTotals).reduce((s,c) => s + c.target, 0);
                                    const a = Object.values(deptTotals).reduce((s,c) => s + c.actual, 0);
                                    const v = a - t;
                                    return (
                                        <span className={v >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
                                            {formatNumber(v)}
                                        </span>
                                    );
                                })()}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    };

    const formatNumber = (num: number) => {
        if (num === 0) return "0.00";
        return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
    };

    // Standardized formatDateDisplay is defined above

    const handleExportCSV = () => {
        if (!reportData) return;

        const csvRows: string[] = [];
        csvRows.push(`Company: ${currentCompany?.name || ""}`);
        csvRows.push(`Target Vs Actual Sales Report`);
        if (reportSubtitle) csvRows.push(`${reportSubtitle}`);
        csvRows.push(`From ${formatDateWithSuffix(fromDate, effectiveDisplayMode)} to ${formatDateWithSuffix(toDate, effectiveDisplayMode)}`);
        csvRows.push("");

        if (viewType === "matrix-detailed" && matrixData) {
            const { dimensions, incomeRows, expenseRows, deptTotals } = matrixData;
            const headers = ["Sales Item", ...dimensions, "Total"];
            csvRows.push(headers.map(h => `"${h}"`).join(","));

            incomeRows.forEach(row => {
                let rowTotal = 0;
                const cells = dimensions.map(d => {
                    rowTotal += row.cells[d].actual;
                    return formatNumber(row.cells[d].actual);
                });
                csvRows.push(`"${row.name.replace(/"/g, '""')}",${cells.join(",")},"${formatNumber(rowTotal)}"`);
            });

            csvRows.push("");
            csvRows.push(`"NET POSITION (ACTUAL)",${dimensions.map(d => formatNumber(deptTotals[d].actual)).join(",")},"${formatNumber(Object.values(deptTotals).reduce((s, c) => s + c.actual, 0))}"`);
        } else if (viewType === "matrix-summary" && matrixData) {
            const { dimensions, deptTotals } = matrixData;
            const headers = ["Department", "Target", "Actual", "Variance", "% Performance"];
            csvRows.push(headers.map(h => `"${h}"`).join(","));

            dimensions.forEach(d => {
                const stats = deptTotals[d];
                const variance = stats.actual - stats.target;
                const pct = stats.target !== 0 ? (stats.actual / Math.abs(stats.target)) * 100 : 0;
                csvRows.push(`"${d.replace(/"/g, '""')}","${formatNumber(stats.target)}","${formatNumber(stats.actual)}","${formatNumber(variance)}","${pct.toFixed(1)}%"`);
            });

            const grandTarget = Object.values(deptTotals).reduce((s, c) => s + c.target, 0);
            const grandActual = Object.values(deptTotals).reduce((s, c) => s + c.actual, 0);
            const grandVar = grandActual - grandTarget;
            csvRows.push(`"GRAND TOTAL","${formatNumber(grandTarget)}","${formatNumber(grandActual)}","${formatNumber(grandVar)}","${grandTarget !== 0 ? ((grandActual / Math.abs(grandTarget)) * 100).toFixed(1) + '%' : '—'}"`);
        } else if (groupBy && dimensionData) {
            const headers = [groupBy === "department" ? "Department" : "Project", "Type", ...dimensionData.months.map(m => m.label), "Total"];
            csvRows.push(headers.map(h => `"${h}"`).join(","));

            dimensionData.dimensions.forEach(dim => {
                const d = dimensionData.dimMap[dim];
                const cleanDim = dim.replace(/"/g, '""');
                
                // Target Row
                csvRows.push(`"${cleanDim}","TARGET",${dimensionData.months.map(m => formatNumber(d.target[m.key])).join(",")},"${formatNumber(d.totalTarget)}"`);
                // Actual Row
                csvRows.push(`"","ACTUAL",${dimensionData.months.map(m => formatNumber(d.actual[m.key])).join(",")},"${formatNumber(d.totalActual)}"`);
                // Variance Amount
                csvRows.push(`"","VARIANCE",${dimensionData.months.map(m => formatNumber(d.net[m.key])).join(",")},"${formatNumber(d.totalNet)}"`);
                // Variance %
                csvRows.push(`"","VARIANCE %",${dimensionData.months.map(m => {
                    const t = d.target[m.key] || 0;
                    const n = d.net[m.key] || 0;
                    const pct = t !== 0 ? (n / Math.abs(t)) * 100 : null;
                    return pct !== null ? `"${pct.toFixed(1)}%"` : '"—"';
                }).join(",")},"${d.totalTarget !== 0 ? ((d.totalNet / Math.abs(d.totalTarget)) * 100).toFixed(1) + '%' : '—'}"`);
                
                csvRows.push(""); // Spacer
            });

            // Overall Totals
            csvRows.push(`"GRAND TOTAL","TARGET",${dimensionData.months.map(m => formatNumber(dimensionData.overallTarget[m.key])).join(",")},"${formatNumber(dimensionData.grandTarget)}"`);
            csvRows.push(`"","ACTUAL",${dimensionData.months.map(m => formatNumber(dimensionData.overallActual[m.key])).join(",")},"${formatNumber(dimensionData.grandActual)}"`);
            csvRows.push(`"","VARIANCE",${dimensionData.months.map(m => formatNumber(dimensionData.overallNet[m.key])).join(",")},"${formatNumber(dimensionData.grandNet)}"`);
        } else {
            const headers = ["Account Group / Ledger", ...mappedData.months.map(m => m.label), "Total"];
            csvRows.push(headers.map(h => `"${h}"`).join(","));

            const addBlock = (block: { target: any[], actual: any[] }, label: string) => {
                csvRows.push(`"${label}",${mappedData.months.map(() => '""').join(",")},""`);
                block.actual.forEach(group => {
                    csvRows.push(`"${group.name} (Actual)",${mappedData.months.map(m => formatNumber(group.monthly[m.key])).join(",")},"${formatNumber(group.total)}"`);
                    const tGroup = block.target.find(tg => tg.name === group.name);
                    if (tGroup) {
                        csvRows.push(`"${group.name} (Target)",${mappedData.months.map(m => formatNumber(tGroup.monthly[m.key])).join(",")},"${formatNumber(tGroup.total)}"`);
                        const n = group.total - tGroup.total;
                        const pct = tGroup.total !== 0 ? (n / Math.abs(tGroup.total)) * 100 : null;
                        csvRows.push(`"${group.name} (Var %)",${mappedData.months.map(m => {
                            const tm = tGroup.monthly[m.key] || 0;
                            const am = group.monthly[m.key] || 0;
                            const nm = am - tm;
                            const pm = tm !== 0 ? (nm / Math.abs(tm)) * 100 : null;
                            return pm !== null ? `"${pm.toFixed(1)}%"` : '"—"';
                        }).join(",")},"${pct !== null ? pct.toFixed(1) + '%' : '—'}"`);
                    }
                });
            };

            addBlock(mappedData.rows.income, "INCOME PERFORMANCE");
            addBlock(mappedData.rows.expense, "EXPENDITURE PERFORMANCE");

            csvRows.push(`"NET SURPLUS/DEFICIT (I-E)",${mappedData.months.map(m => formatNumber(mappedData.totals.NET[m.key])).join(",")},"${formatNumber(Object.values(mappedData.totals.NET).reduce((a, b) => a + b, 0))}"`);
        }

        const csvContent = csvRows.join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "target-vs-actual-report.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handlePrint = () => {
        if (typeof window === "undefined") return;
        openPrintWindow({
            contentHtml: printRef.current?.innerHTML ?? "",
            title: "Target vs Actual Sales",
            company: currentCompany?.name || "",
            period: fromDate && toDate ? `${fromDate} – ${toDate}` : "",
            orientation: "landscape",
        });
    };

    if (!canRead) {
        return (
            <div className="space-y-4">
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
                    <div className="h-[3px] w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-2">
                        <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
                                <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Target Vs Actual Sales</h1>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">Access restricted or insufficient permissions.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-12">
            <PrintStyles />

            {/* Header Section */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden no-print">
                <div className="h-[3px] w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-2">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
                             <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Target Vs Actual Sales</h1>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">Variance analysis report</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 text-xs font-semibold shadow-sm hover:shadow transition-all duration-150"
                        >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                            Back
                        </button>
                        <button
                            type="button"
                            onClick={() => router.push(`/companies/${companyId}/reports`)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-100 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:border-rose-900/30 dark:bg-rose-900/20 dark:text-rose-400 text-xs font-semibold shadow-sm hover:shadow-md transition-all duration-150"
                        >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            Close
                        </button>
                    </div>
                </div>
            </div>

            {/* Filter Section */}
            <div className="no-print rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm bg-slate-50/50 dark:bg-slate-900/50 overflow-hidden">
                {/* Filter Panel Header */}
                <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                    <span className="text-slate-800 dark:text-slate-200 text-sm font-semibold tracking-wide flex items-center gap-2">
                        <span className="grayscale opacity-70">🔍</span> Report Filters
                    </span>
                    <div className="flex items-center gap-2 ml-auto">
                        <button
                            type="button"
                            onClick={handlePrint}
                            className="flex items-center gap-1.5 h-8 rounded-lg px-3 text-xs font-medium border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
                        >
                            <svg className="w-3.5 h-3.5 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.821V21h10.56v-7.179m-10.56 0a2.397 2.397 0 01-1.611-1.042 2.454 2.454 0 01-.223-2.031c.338-1.037 1.353-1.616 2.394-1.616h9.1c1.041 0 2.056.579 2.394 1.616a2.455 2.455 0 01-.223 2.03c-.337.58-.916 1.01-1.611 1.042m-10.56 0h10.56m-10.56 0a2.397 2.397 0 001.611 1.042 2.454 2.454 0 00.223 2.031c-.338 1.037-1.353 1.616-2.394 1.616h-9.1c-1.041 0-2.056-.579-2.394-1.616a2.455 2.455 0 00.223-2.03c.337-.58.916-1.01 1.611-1.042m10.56 0V11m-10.56 0V11" />
                            </svg>
                            Print
                        </button>
                        <div className="flex items-center h-8">
                            <select
                                className="h-8 rounded-l-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-300 border-r-0"
                                value={downloadFormat}
                                onChange={(e) => setDownloadFormat(e.target.value as any)}
                            >
                                <option value="PDF">PDF</option>
                                <option value="XLS">Excel (.xls)</option>
                                <option value="CSV">Excel (.csv)</option>
                            </select>
                            <button
                                type="button"
                                onClick={() => downloadFormat === 'CSV' ? handleExportCSV() : handlePrint()}
                                className="h-8 rounded-r-lg px-3 text-xs font-semibold text-white transition-all shadow-sm bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1.5"
                            >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                                Download
                            </button>
                        </div>
                    </div>
                </div>

                <div className="p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Context</label>
                            <select
                                className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                value={effectiveDisplayMode}
                                onChange={(e: any) => {
                                    if (!companyId) return;
                                    const next = e.target.value as "AD" | "BS";
                                    setEffectiveDisplayMode(next);
                                    writeCalendarReportDisplayMode(companyId, next);
                                }}
                            >
                                <option value="AD">AD Calendar</option>
                                <option value="BS">BS Calendar</option>
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">View</label>
                            <select
                                className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer"
                                value={filterMode}
                                onChange={(e) => setFilterMode(e.target.value as any)}
                            >
                                <option value="MONTH">Month Matrix Selection</option>
                                <option value="PERIOD">Custom Date Range</option>
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Grouping</label>
                            <select
                                className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                value={groupBy}
                                onChange={(e) => setGroupBy(e.target.value as any)}
                            >
                                <option value="">By Account Head</option>
                                <option value="department">By Department</option>
                                <option value="project">By Project</option>
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Layout</label>
                            <select
                                className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                value={viewType}
                                onChange={(e) => setViewType(e.target.value as any)}
                            >
                                <option value="detailed">Detailed View (Ledger)</option>
                                <option value="summary">Summary View (Group)</option>
                                <option value="matrix-detailed">Matrix Detailed (Dept Columns)</option>
                                <option value="matrix-summary">Matrix Summary (Dept Summary)</option>
                            </select>
                        </div>
                    </div>

                    {filterMode === "MONTH" ? (
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Select reporting months</label>
                            <div className="flex flex-wrap gap-1.5">
                                {presetMonths.map((m) => {
                                    const active = selectedMonths.includes(m.value);
                                    return (
                                        <button
                                            key={m.value}
                                            type="button"
                                            onClick={() => handleMonthToggle(m.value)}
                                            className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all duration-200 border ${
                                                active 
                                                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100' 
                                                    : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300 hover:bg-slate-50'
                                            }`}
                                        >
                                            {m.label}
                                        </button>
                                    );
                                })}
                                <button
                                    type="button"
                                    onClick={() => handleMonthToggle("ALL")}
                                    className="px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest border border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
                                >
                                    {selectedMonths.length === presetMonths.length ? "UNCLEAN" : "SELECT ALL"}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">From Date ({effectiveDisplayMode})</label>
                                {effectiveDisplayMode === "BS" ? (
                                    <NepaliDatePicker
                                        value={fromDate}
                                        onChange={handleCustomFromDate}
                                        options={{ calenderLocale: 'ne', valueLocale: 'en' }}
                                        // @ts-ignore
                                        minDate={currentCompany?.fiscal_year_start ? (safeADToBS(currentCompany.fiscal_year_start) || "") : ""}
                                        // @ts-ignore
                                        maxDate={currentCompany?.fiscal_year_end ? (safeADToBS(currentCompany.fiscal_year_end) || "") : ""}
                                        className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20"
                                    />
                                ) : (
                                    <Input
                                        type="date"
                                        value={fromDate}
                                        min={currentCompany?.fiscal_year_start || ""}
                                        max={currentCompany?.fiscal_year_end || ""}
                                        onChange={(e: any) => handleCustomFromDate(e.target.value)}
                                        className="h-9 bg-slate-50 text-xs font-semibold"
                                    />
                                )}
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">To Date ({effectiveDisplayMode})</label>
                                {effectiveDisplayMode === "BS" ? (
                                    <NepaliDatePicker
                                        value={toDate}
                                        onChange={handleCustomToDate}
                                        options={{ calenderLocale: 'ne', valueLocale: 'en' }}
                                        // @ts-ignore
                                        minDate={currentCompany?.fiscal_year_start ? (safeADToBS(currentCompany.fiscal_year_start) || "") : ""}
                                        // @ts-ignore
                                        maxDate={currentCompany?.fiscal_year_end ? (safeADToBS(currentCompany.fiscal_year_end) || "") : ""}
                                        className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20"
                                    />
                                ) : (
                                    <Input
                                        type="date"
                                        value={toDate}
                                        min={currentCompany?.fiscal_year_start || ""}
                                        max={currentCompany?.fiscal_year_end || ""}
                                        onChange={(e: any) => handleCustomToDate(e.target.value)}
                                        className="h-9 bg-slate-50 text-xs font-semibold"
                                    />
                                )}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Department</label>
                            <select
                                className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                value={departmentFilter}
                                onChange={(e) => setDepartmentFilter(e.target.value)}
                            >
                                <option value="">All Departments</option>
                                {departments?.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Project</label>
                            <select
                                className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                value={projectFilter}
                                onChange={(e) => setProjectFilter(e.target.value)}
                            >
                                <option value="">All Projects</option>
                                {projects?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>

                        <div className="flex gap-2 ml-auto md:col-span-2">
                            <button 
                                type="button"
                                onClick={handleReset}
                                className="flex-1 min-w-[90px] h-8 border border-slate-300 bg-white text-slate-700 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all duration-200 hover:bg-slate-50 shadow-sm flex items-center justify-center gap-2"
                            >
                                <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                                Reset
                            </button>
                            <button
                                type="button"
                                onClick={handleToday}
                                className="flex-1 min-w-[100px] h-8 border border-indigo-200 bg-indigo-50 text-indigo-700 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all duration-200 hover:bg-indigo-100 flex items-center justify-center gap-2"
                            >
                                <svg className="w-3.5 h-3.5 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                                This FY
                            </button>
                            <button
                                type="button"
                                onClick={handleShow}
                                className="flex-1 min-w-[130px] h-8 bg-green-600 border border-green-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-green-700 transition-all duration-200 shadow-md shadow-green-100 flex items-center justify-center gap-2"
                            >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                                Show Report
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div ref={printRef} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm min-h-[500px]">
                {!showReport ? (
                    <div className="h-64 flex flex-col items-center justify-center text-slate-300">
                         <p className="text-[10px] font-black uppercase tracking-widest">Select parameters to generate report</p>
                    </div>
                ) : !reportData ? (
                    <div className="h-64 flex flex-col items-center justify-center">
                         <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="text-center pb-6 border-b border-slate-100">
                            <h2 className="text-xl font-bold text-slate-800 tracking-tight">{currentCompany?.name}</h2>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Target Vs Actual Sales Analysis</p>
                            <div className="flex justify-center gap-4 mt-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">Period: {formatDateWithSuffix(fromDate, effectiveDisplayMode)} - {formatDateWithSuffix(toDate, effectiveDisplayMode)}</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase">Calendar: {effectiveDisplayMode}</span>
                            </div>
                            {reportSubtitle && (
                                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-2 bg-indigo-50/50 inline-block px-4 py-1 rounded-full">
                                    {reportSubtitle}
                                </p>
                            )}
                        </div>

                        <div className="overflow-x-auto">
                            {viewType === "matrix-detailed" ? renderMatrixDetailedView() :
                             viewType === "matrix-summary" ? renderMatrixSummaryView() :
                             groupBy && dimensionData ? (
                                <table className="w-full text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 border-y border-slate-200 text-slate-500 font-bold uppercase text-[9px] tracking-widest">
                                            <th className="p-3 text-left sticky left-0 bg-slate-50 z-10 border-r border-slate-200 min-w-[200px]">
                                                {groupBy === "department" ? "Department" : "Project"} Perspective
                                            </th>
                                            <th className="p-3 text-center border-l border-slate-100">Type</th>
                                            {dimensionData?.months.map(m => <th key={m.key} className="p-3 text-right border-l border-slate-100">{m.label}</th>)}
                                            <th className="p-3 text-right bg-slate-100 border-l border-slate-200">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {dimensionData?.dimensions.map((dim, dIdx) => {
                                            const d = (dimensionData as any).dimMap[dim];
                                            return (
                                                <React.Fragment key={`dim_${dIdx}`}>
                                                    <tr className="hover:bg-slate-50/20 group">
                                                        <td rowSpan={3} className="p-3 font-bold text-slate-700 bg-white border-r border-slate-200 sticky left-0 z-10 align-top shadow-sm">{dim}</td>
                                                        <td className="p-2 text-center text-[9px] font-bold text-emerald-600 uppercase border-b border-slate-50/50">Target</td>
                                                        {dimensionData?.months.map(m => <td key={`di_${m.key}`} className="p-2 text-right font-mono text-slate-400 border-b border-slate-50/50">{formatNumber(d.target[m.key] || 0)}</td>)}
                                                        <td className="p-2 text-right font-bold text-emerald-600 bg-emerald-50/10 border-b border-slate-50/50">{formatNumber(d.totalTarget)}</td>
                                                    </tr>
                                                    <tr className="hover:bg-slate-50/20 group">
                                                        <td className="p-2 text-center text-[9px] font-bold text-rose-500 uppercase border-b border-slate-50/50">Actual</td>
                                                        {dimensionData?.months.map(m => <td key={`de_${m.key}`} className="p-2 text-right font-mono text-slate-800 border-b border-slate-50/50">{formatNumber(d.actual[m.key] || 0)}</td>)}
                                                        <td className="p-2 text-right font-bold text-slate-900 bg-slate-50/50 border-b border-slate-50/50">{formatNumber(d.totalActual)}</td>
                                                    </tr>
                                                    <tr className="bg-slate-50/30">
                                                        <td className="p-2 text-center text-[9px] font-bold text-indigo-600 uppercase">Variance</td>
                                                        {dimensionData?.months.map(m => {
                                                            const t = d.target[m.key] || 0;
                                                            const n = d.net[m.key] || 0;
                                                            const pct = t !== 0 ? (n / Math.abs(t)) * 100 : null;
                                                            return (
                                                                <td key={`dn_${m.key}`} className={`p-2 text-right font-bold ${n < 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                                                                    <div>{formatNumber(n)}</div>
                                                                    {pct !== null && <div className="text-[8px] opacity-70">({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</div>}
                                                                </td>
                                                            );
                                                        })}
                                                        <td className={`p-2 text-right font-black ${d.totalNet < 0 ? 'text-rose-600 underline' : 'text-emerald-700'}`}>{formatNumber(d.totalNet)}</td>
                                                    </tr>
                                                </React.Fragment>
                                            )
                                        })}
                                        <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold">
                                            <td className="p-3 sticky left-0 bg-slate-100 font-black text-[10px] uppercase tracking-wider z-10 border-r border-slate-300 text-slate-800">Grand Performance</td>
                                            <td className="p-3 text-center text-[9px] font-black uppercase text-indigo-700">Net</td>
                                            {dimensionData?.months.map(m => <td key={`gt_${m.key}`} className="p-3 text-right text-indigo-700">{formatNumber(dimensionData.overallNet[m.key])}</td>)}
                                            <td className={`p-3 text-right text-[13px] font-black ${dimensionData?.grandNet < 0 ? 'text-rose-600 underline' : 'text-emerald-700'}`}>{formatNumber(dimensionData.grandNet)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            ) : (
                                <table className="w-full text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 border-y border-slate-200 text-slate-500 font-bold uppercase text-[9px] tracking-widest">
                                            <th className="p-3 text-left sticky left-0 bg-slate-50 z-10 border-r border-slate-200 min-w-[300px]">Account Head & Particulars</th>
                                            {mappedData?.months.map(m => <th key={m.key} className="p-3 text-right border-l border-slate-200">{m.label}</th>) }
                                            <th className="p-3 text-right bg-slate-100 border-l border-slate-200">Aggregate</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {mappedData && (
                                            <>
                                                {renderCategorySection("Revenue", { target: mappedData.rows.income.target, actual: mappedData.rows.income.actual }, true)}
                                                {renderCategorySection("Expenditure", { target: mappedData.rows.expense.target, actual: mappedData.rows.expense.actual }, false)}
                                        <tr className="bg-slate-100/80 border-t-2 border-slate-300 font-bold">
                                                    <td className="p-4 px-6 sticky left-0 bg-slate-100 text-[10px] font-black uppercase tracking-widest z-10 border-r-2 border-slate-300 text-slate-800">Net Performance Position</td>
                                                    {mappedData.months.map(m => (
                                                        <td key={`net_${m.key}`} className={`p-4 text-right border-r border-slate-200 ${mappedData.totals.NET[m.key] < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                                                            {formatNumber(mappedData.totals.NET[m.key])}
                                                        </td>
                                                    ))}
                                                    <td className={`p-4 text-right font-black border-l border-slate-300 text-lg ${ (mappedData.totals.OVERALL.ia - mappedData.totals.OVERALL.ea) < 0 ? 'text-rose-600 underline' : 'text-indigo-600'}`}>
                                                        {formatNumber(mappedData.totals.OVERALL.ia - mappedData.totals.OVERALL.ea)}
                                                    </td>
                                                </tr>
                                            </>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div className="pt-8 border-t border-slate-100 flex justify-between items-center text-[8px] font-bold text-slate-400 uppercase tracking-widest italic print-hidden">
                            <span>Auth: {currentUser?.name || "Verified User"}</span>
                            <span>Generated: {new Date().toLocaleString()}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
