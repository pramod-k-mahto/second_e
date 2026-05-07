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
import { safeADToBS, safeBSToAD, isIsoDateString } from "@/lib/bsad";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import { Input } from "@/components/ui/Input";
import { openPrintWindow } from '@/lib/printReport';
// shadcn select removed - using native select for filter dropdowns

// Helper function to get months in a range
const getMonthsInRange = (fromDate: string, toDate: string) => {
    const months = [];
    const current = new Date(fromDate);
    const end = new Date(toDate);

    while (current <= end) {
        const year = current.getFullYear();
        const month = (current.getMonth() + 1).toString().padStart(2, '0');
        months.push({ key: `${year}-${month}`, label: `${year}-${month}` });
        current.setMonth(current.getMonth() + 1);
    }
    return months;
};

const fetcher = (url: string) => api.get(url).then((res) => res.data);

const toNepaliDigits = (num: number | string) => {
    const nepaliDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
    return num.toString().replace(/\d/g, (d) => nepaliDigits[parseInt(d, 10)]);
};

const getActivityType = (groupName: string): "Operating" | "Investing" | "Financing" => {
    const gn = (groupName || "").toLowerCase();
    
    // Investing Activities: Fixed Assets, Investments, Capital Work-in-Progress
    if (gn.includes("fixed assets") || gn.includes("investment") || gn.includes("cwip") || gn.includes("capital work")) return "Investing";
    
    // Financing Activities: Capital, Loans, Dividends, Equity, Secured/Unsecured Loans
    if (gn.includes("capital account") || gn.includes("loan") || gn.includes("borrowing") || 
        gn.includes("secured") || gn.includes("unsecured") || gn.includes("financing") || 
        gn.includes("equity") || gn.includes("dividend") || gn.includes("shareholder")) return "Financing";
    
    // Default: Operating Activities
    // Includes: Sundry Debtors, Creditors, Sales, Purchases, Direct/Indirect Expenses, Direct/Indirect Incomes, Duties & Taxes, Provisions
    return "Operating";
};


interface CashFlowRow {
    group_name: string;
    group_type: "INFLOW" | "OUTFLOW";
    ledger_name: string;
    month_key: string;
    amount: number;
    dimension_name?: string;
    dr_cr?: string;
    voucher_date?: string;
    voucher_type?: string;
}

interface MonthInfo {
    key: string;
    label: string;
    rangeLabel: string;
}

const toEnglishDigits = (num: number | string) => {
    const nepaliDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
    return num.toString().replace(/[०-९]/g, (d) => nepaliDigits.indexOf(d).toString());
};

export default function CashFlowReportPage() {
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
    const [accountTypeFilter, setAccountTypeFilter] = useState<"all" | "cash" | "bank">("all");

    const { data: currentUser } = useSWR(
        "/auth/me",
        fetcher
    );

    const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [downloadFormat, setDownloadFormat] = useState<"PDF" | "CSV" | "XLS">("PDF");
    const [showReport, setShowReport] = useState(false);
    const [groupBy, setGroupBy] = useState<"" | "department" | "project" | "ledger">("");
    const [viewType, setViewType] = useState<"detailed" | "summary" | "matrix_detailed" | "matrix_summary">("matrix_detailed");
    const [showSummaryCards, setShowSummaryCards] = useState(true);
    const [selectedStatCards, setSelectedStatCards] = useState([
        "received_debtors", "received_cash", "received_bank",
        "paid_suppliers", "total_received", "total_paid", "net_cash_flow"
    ]);

    const [filterMode, setFilterMode] = useState<"MONTH" | "PERIOD">("MONTH");

    const { data: companyInfo } = useSWR<{ fiscal_year_start?: string; fiscal_year_end?: string }>(
        companyId ? `/companies/${companyId}` : null,
        fetcher
    );

    const { data: departments } = useSWR(
        (companyId && showReport) ? `/companies/${companyId}/departments` : null,
        fetcher
    );

    const { data: projects } = useSWR(
        (companyId && showReport) ? `/companies/${companyId}/projects` : null,
        fetcher
    );
    const { data: segments } = useSWR(
        (companyId && showReport) ? `/companies/${companyId}/segments` : null,
        fetcher
    );

    const { canRead } = useMenuAccess("reports.mis_cash_flow");

    const formatDateDisplay = (dateStr: string) => {
        if (!dateStr) return "";
        return formatDateWithSuffix(dateStr, effectiveDisplayMode);
    };

    const isBS = effectiveDisplayMode === "BS";
    const currentCompany = cc;
    // For legacy compatibility
    const dateDisplayMode = effectiveDisplayMode;




    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

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


    const formatMonthName = React.useCallback((key: string) => {
        const parts = key.split("-");
        if (parts.length !== 2) return key;
        const mIdx = parseInt(parts[1], 10) - 1;
        const y = parts[0];

        if (effectiveDisplayMode === "BS") {
            const bsMonths = ["वैशाख", "जेठ", "असार", "साउन", "भदौ", "असोज", "कात्तिक", "मंसिर", "पुस", "माघ", "फागुन", "चैत"];
            if (mIdx < 0 || mIdx > 11) return key;
            return `${bsMonths[mIdx]} ${toNepaliDigits(y)}`;
        } else {
            const adMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            if (mIdx < 0 || mIdx > 11) return key;
            return `${adMonths[mIdx]} ${y}`;
        }
    }, [effectiveDisplayMode]);

    const getMonthRangeLabel = React.useCallback((key: string) => {
        const parts = key.split("-");
        if (parts.length < 2) return "";
        const yStr = parts[0];
        const mStr = parts[1];
        const m = parseInt(mStr, 10);
        const y = parseInt(yStr, 10);
        
        const start = "01";
        let end = "30";
        
        if (effectiveDisplayMode === "BS") {
            const mStrPad = mStr.padStart(2, '0');
            for (let d = 32; d >= 28; d--) {
                const dStr = d.toString().padStart(2, '0');
                const test = `${yStr}-${mStrPad}-${dStr}`;
                const ad = safeBSToAD(test);
                if (ad !== "") {
                    // Round-trip check to ensure strict BS date validity
                    const back = safeADToBS(ad);
                    if (back === test) {
                        end = dStr;
                        break;
                    }
                }
            }
            return `(${toNepaliDigits(start)}-${toNepaliDigits(end)})`;
        } else {
            const dDate = new Date(y, m, 0);
            end = dDate.getDate().toString().padStart(2, '0');
            return `(${start}-${end})`;
        }
    }, [effectiveDisplayMode]);

    const computeDatesFromMonths = React.useCallback((months: string[]) => {
        if (months.length === 0) {
            setFromDate("");
            setToDate("");
            return;
        }
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
            lastDay = `${y}-${mStr}-${dDate.getDate().toString().padStart(2, '0')}`;
        } else {
            const [yStr, mStr] = endMonthVal.split('-');
            const mStrPad = mStr.padStart(2, '0');
            for (let d = 32; d >= 28; d--) {
                const dStr = d.toString().padStart(2, '0');
                const testVal = `${yStr}-${mStrPad}-${dStr}`;
                const ad = safeBSToAD(testVal);
                if (ad !== '') {
                    // Strict round-trip check
                    const back = safeADToBS(ad);
                    if (back === testVal) {
                        lastDay = testVal;
                        break;
                    }
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
    }, [effectiveDisplayMode, isBS]);

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
        computeDatesFromMonths(next);
    };

    const computeMonthsFromDates = React.useCallback((from: string, to: string) => {
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
    }, [presetMonths]);

    const toDisplayDate = React.useCallback((stored: string) => {
        if (!stored) return "";
        if (effectiveDisplayMode === "BS") {
            return isBS ? stored : safeADToBS(stored) || stored;
        } else {
            return isBS ? safeBSToAD(stored) || stored : stored;
        }
    }, [effectiveDisplayMode, isBS]);

    const getMonthKeyRange = React.useCallback((start: string, end: string) => {
        const result: string[] = [];
        if (!start || !end) return result;

        const startParts = start.split("-");
        const endParts = end.split("-");
        if (startParts.length < 2 || endParts.length < 2) return result;

        let curY = parseInt(startParts[0], 10);
        let curM = parseInt(startParts[1], 10);
        const endY = parseInt(endParts[0], 10);
        const endM = parseInt(endParts[1], 10);

        // Safety limit to prevent infinite loops (e.g. 10 years max)
        let iterations = 0;
        while ((curY < endY || (curY === endY && curM <= endM)) && iterations < 120) {
            result.push(`${curY}-${curM.toString().padStart(2, "0")}`);
            curM++;
            if (curM > 12) {
                curM = 1;
                curY++;
            }
            iterations++;
        }
        return result;
    }, []);

    const handleCustomFromDate = (val: string) => {
        const next = effectiveDisplayMode === "BS" 
            ? (isBS ? val : safeBSToAD(val) || "")
            : (isBS ? safeADToBS(val) || "" : val);
        setFromDate(next);
    };

    const handleCustomToDate = (val: string) => {
        const next = effectiveDisplayMode === "BS" 
            ? (isBS ? val : safeBSToAD(val) || "")
            : (isBS ? safeADToBS(val) || "" : val);
        setToDate(next);
    };

    const handleShow = () => {
        if (filterMode === "MONTH" && selectedMonths.length > 0) {
            computeDatesFromMonths(selectedMonths);
        } else if (filterMode === "PERIOD" && fromDate && toDate) {
            computeMonthsFromDates(toDisplayDate(fromDate), toDisplayDate(toDate));
        }
        setShowReport(true);
    };


    const reportUrl = useMemo(() => {
        if (!companyId || !fromDate || !toDate || !showReport) return null;

        const fromAD = isBS ? safeBSToAD(fromDate) : fromDate;
        const toAD = isBS ? safeBSToAD(toDate) : toDate;

        let url = `/companies/${companyId}/reports/mis-cash-flow?from_date=${fromAD}&to_date=${toAD}&calendar_mode=${effectiveDisplayMode}&account_type=${accountTypeFilter}`;

        if (departmentFilter) {
            url += `&department_id=${departmentFilter}`;
        }
        if (projectFilter) {
            url += `&project_id=${projectFilter}`;
        }
        if (segmentFilter) {
            url += `&segment_id=${segmentFilter}`;
        }
        if (groupBy) {
            url += `&group_by=${groupBy}`;
        }

        return url;
    }, [companyId, fromDate, toDate, departmentFilter, projectFilter, segmentFilter, groupBy, accountTypeFilter, isBS, effectiveDisplayMode, showReport]);

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

    const reportSubtitle = useMemo(() => {
        if (groupBy === "department") return selectedDeptName ? `Department: ${selectedDeptName}` : "All Departments (Department-wise)";
        if (groupBy === "project") return selectedProjName ? `Project: ${selectedProjName}` : "All Projects (Project-wise)";
        if (selectedDeptName) return `Department: ${selectedDeptName}`;
        if (selectedProjName) return `Project: ${selectedProjName}`;
        if (selectedSegName) return `Segment: ${selectedSegName}`;
        return "";
    }, [groupBy, selectedDeptName, selectedProjName, selectedSegName]);

    const { data: reportData, error: reportError } = useSWR<{ 
        data: CashFlowRow[], 
        opening_balance?: number, 
        opening_ledger_breakdown?: {ledger_name: string, amount: number}[] 
    }>(
        reportUrl,
        fetcher
    );

    const activeMonthKeys = useMemo(() => {
        if (!fromDate || !toDate) return [];
        if (filterMode === "MONTH" && selectedMonths.length > 0) {
            return [...selectedMonths].sort((a, b) => {
                const [yA, mA] = a.split("-").map(Number);
                const [yB, mB] = b.split("-").map(Number);
                if (yA !== yB) return yA - yB;
                return mA - mB;
            });
        }
        return getMonthsInRange(fromDate, toDate).map(m => m.key);
    }, [filterMode, selectedMonths, fromDate, toDate]);

    const summaryStats = useMemo(() => {
        if (!showReport || !reportData?.data || activeMonthKeys.length === 0) return null;

        const stats: any = {
            OVERALL: {
                received_debtors: 0,
                received_cash: 0,
                received_bank: 0,
                amount_receivable: 0,
                paid_suppliers: 0,
                total_received: 0,
                total_paid: 0,
                withdrawn_bank: 0,
                deposited_bank: 0,
                net_cash_flow: 0
            }
        };

        activeMonthKeys.forEach(mKey => {
            stats[mKey] = {
                received_debtors: 0,
                received_cash: 0,
                received_bank: 0,
                amount_receivable: 0,
                paid_suppliers: 0,
                total_received: 0,
                total_paid: 0,
                withdrawn_bank: 0,
                deposited_bank: 0,
                net_cash_flow: 0
            };
        });

        // Initialize receivable from opening breakdown
        let initialReceivable = 0;
        if (reportData.opening_ledger_breakdown) {
            reportData.opening_ledger_breakdown.forEach((l: any) => {
                const name = (l.ledger_name || "").toLowerCase();
                if (name.includes("debtor") || name.includes("receivable")) {
                    initialReceivable += Number(l.amount) || 0;
                }
            });
        }

        // Track running receivable
        const monthlyDebtorMovements: Record<string, number> = {};
        activeMonthKeys.forEach(mKey => monthlyDebtorMovements[mKey] = 0);

        reportData.data.forEach((item: any) => {
            const mKey = item.month_key || "unknown";
            if (!stats[mKey]) return;

            const amt = Number(item.amount) || 0;
            const isReceipt = item.voucher_type?.toLowerCase().includes("receipt");
            const isPayment = item.voucher_type?.toLowerCase().includes("payment") || item.voucher_type?.toLowerCase().includes("purchase");
            const isContra = item.voucher_type?.toLowerCase().includes("contra");
            
            const groupName = (item.group_name || "").toLowerCase();
            const ledgerName = (item.ledger_name || "").toLowerCase();

            // Check if this affects Sundry Debtors (Receivable)
            if (groupName.includes("sundry debtors") || ledgerName.includes("debtor")) {
                // In cash flow data, an INFLOW (receipt) from a debtor REDUCES their balance
                if (item.group_type === "INFLOW") {
                    monthlyDebtorMovements[mKey] -= amt;
                } else {
                    // An OUTFLOW (maybe a refund) INCREASES their balance
                    monthlyDebtorMovements[mKey] += amt;
                }
            }

            if (isReceipt) {
                stats[mKey].total_received += amt;
                stats.OVERALL.total_received += amt;
                if (groupName.includes("sundry debtors") || ledgerName.includes("debtor")) {
                    stats[mKey].received_debtors += amt;
                    stats.OVERALL.received_debtors += amt;
                }
                if (ledgerName.includes("cash")) {
                    stats[mKey].received_cash += amt;
                    stats.OVERALL.received_cash += amt;
                } else if (ledgerName.includes("bank") || ledgerName.includes("sbi") || ledgerName.includes("nabil")) {
                    stats[mKey].received_bank += amt;
                    stats.OVERALL.received_bank += amt;
                }
            }

            if (isPayment) {
                stats[mKey].total_paid += amt;
                stats.OVERALL.total_paid += amt;
                if (groupName.includes("sundry creditors") || ledgerName.includes("creditor")) {
                    stats[mKey].paid_suppliers += amt;
                    stats.OVERALL.paid_suppliers += amt;
                }
            }

            if (isContra) {
                if (item.dr_cr === "cr") {
                    stats[mKey].withdrawn_bank += amt;
                    stats.OVERALL.withdrawn_bank += amt;
                } else {
                    stats[mKey].deposited_bank += amt;
                    stats.OVERALL.deposited_bank += amt;
                }
            }
        });

        let runningReceivable = initialReceivable;
        activeMonthKeys.forEach(mKey => {
            runningReceivable += monthlyDebtorMovements[mKey] || 0;
            stats[mKey].amount_receivable = runningReceivable;
            stats[mKey].net_cash_flow = stats[mKey].total_received - stats[mKey].total_paid;
        });

        stats.OVERALL.amount_receivable = runningReceivable;
        stats.OVERALL.net_cash_flow = stats.OVERALL.total_received - stats.OVERALL.total_paid;

        return stats;
    }, [showReport, reportData, activeMonthKeys]);

    const mappedData = useMemo(() => {
        if (!showReport || !reportData?.data || activeMonthKeys.length === 0) {
            return { 
                months: [], 
                activities: {
                    Operating: { inflow: [], outflow: [], net: {}, totalInflow: 0, totalOutflow: 0, totalNet: 0 },
                    Investing: { inflow: [], outflow: [], net: {}, totalInflow: 0, totalOutflow: 0, totalNet: 0 },
                    Financing: { inflow: [], outflow: [], net: {}, totalInflow: 0, totalOutflow: 0, totalNet: 0 }
                },
                totals: { 
                    INFLOW: {}, OUTFLOW: {}, NET: {}, OPENING: {}, CLOSING: {}, 
                    OVERALL_INFLOW: 0, OVERALL_OUTFLOW: 0, OVERALL_NET: 0, 
                    OVERALL_OPENING: 0, OVERALL_CLOSING: 0 
                }, 
                openingBreakdown: [] 
            };
        }

        const months = activeMonthKeys.map(mKey => ({
            key: mKey,
            label: formatMonthName(mKey),
            rangeLabel: getMonthRangeLabel(mKey)
        }));
        
        // Structure for activities
        const activities: any = {
            Operating: { inflow: {}, outflow: {}, net: {}, totalInflow: 0, totalOutflow: 0, totalNet: 0 },
            Investing: { inflow: {}, outflow: {}, net: {}, totalInflow: 0, totalOutflow: 0, totalNet: 0 },
            Financing: { inflow: {}, outflow: {}, net: {}, totalInflow: 0, totalOutflow: 0, totalNet: 0 }
        };

        // Initialize activity monthly buckets
        ["Operating", "Investing", "Financing"].forEach(act => {
            months.forEach(m => {
                activities[act].net[m.key] = 0;
            });
        });

        const totals: any = {
            OPENING: {}, OVERALL_OPENING: 0,
            INFLOW: {}, OVERALL_INFLOW: 0,
            OUTFLOW: {}, OVERALL_OUTFLOW: 0,
            NET: {}, OVERALL_NET: 0,
            CLOSING: {}, OVERALL_CLOSING: 0
        };

        months.forEach(m => {
            totals.OPENING[m.key] = 0;
            totals.INFLOW[m.key] = 0;
            totals.OUTFLOW[m.key] = 0;
            totals.NET[m.key] = 0;
            totals.CLOSING[m.key] = 0;
        });

        const openingBal = Number(reportData.opening_balance) || 0;
        totals.OVERALL_OPENING = openingBal;
        if (months.length > 0) {
            totals.OPENING[months[0].key] = openingBal;
        }

        reportData.data.forEach((item: any) => {
            const mKey = item.month_key || "unknown";
            if (!totals.INFLOW[mKey] && totals.INFLOW[mKey] !== 0) return;

            const vType = (item.voucher_type || "").toLowerCase();
            const isContra = vType.includes("contra");
            
            // Internal transfers (Contra) should not affect activity totals in a consolidated cash flow
            // but they might affect individual monthly net if they shift between accounts we are excluding.
            // However, this report is for ALL Cash & Bank accounts, so Contra is a net zero movement.
            if (isContra) return;

            const amt = Number(item.amount) || 0;
            const isReceipt = vType.includes("receipt");
            let groupName = item.group_name || "Unclassified";
            const ledgerName = item.ledger_name || "Unknown Ledger";

            // Professional 'Head' Label Refinement
            const gn = groupName.toLowerCase();
            if (gn.includes("sundry debtors")) groupName = "Receipts from Customers (Debtors)";
            else if (gn.includes("sundry creditors")) groupName = "Payments to Suppliers (Creditors)";
            else if (gn.includes("duties") || gn.includes("tax")) groupName = "Statutory & Tax Payments";
            else if (gn.includes("direct expense") || gn.includes("indirect expense")) groupName = "Operating & Admin Overheads";
            else if (gn.includes("direct income") || gn.includes("indirect income")) groupName = "Other Operating Receipts";
            else if (gn.includes("fixed assets")) groupName = "Capital Expenditure (Fixed Assets)";
            else if (gn.includes("investment")) groupName = "Property & Investments";
            else if (gn.includes("capital account")) groupName = "Owner's Equity & Contributions";
            else if (gn.includes("loan") || gn.includes("borrowing")) groupName = "Loan & Debt Financing";

            const activity = getActivityType(groupName);
            const actBucket = activities[activity];
            const targetMap = isReceipt ? actBucket.inflow : actBucket.outflow;

            if (!targetMap[groupName]) {
                targetMap[groupName] = { name: groupName, total: 0, monthly: {}, ledgers: {} };
                months.forEach(m => targetMap[groupName].monthly[m.key] = 0);
            }
            if (!targetMap[groupName].ledgers[ledgerName]) {
                targetMap[groupName].ledgers[ledgerName] = { name: ledgerName, total: 0, monthly: {} };
                months.forEach(m => targetMap[groupName].ledgers[ledgerName].monthly[m.key] = 0);
            }

            targetMap[groupName].total += amt;
            targetMap[groupName].monthly[mKey] += amt;
            targetMap[groupName].ledgers[ledgerName].total += amt;
            targetMap[groupName].ledgers[ledgerName].monthly[mKey] += amt;
            
            if (isReceipt) {
                actBucket.totalInflow += amt;
                actBucket.totalNet += amt;
                actBucket.net[mKey] += amt;
                totals.INFLOW[mKey] += amt;
                totals.OVERALL_INFLOW += amt;
            } else {
                actBucket.totalOutflow += amt;
                actBucket.totalNet -= amt;
                actBucket.net[mKey] -= amt;
                totals.OUTFLOW[mKey] += amt;
                totals.OVERALL_OUTFLOW += amt;
            }
        });

        let currentRunning = openingBal;
        months.forEach((m, idx) => {
            if (idx > 0) {
                totals.OPENING[m.key] = currentRunning;
            }
            totals.NET[m.key] = totals.INFLOW[m.key] - totals.OUTFLOW[m.key];
            currentRunning += totals.NET[m.key];
            totals.CLOSING[m.key] = currentRunning;
        });
        
        totals.OVERALL_NET = totals.OVERALL_INFLOW - totals.OVERALL_OUTFLOW;
        totals.OVERALL_CLOSING = currentRunning;

        // Convert activity maps to arrays
        const activitiesArray: any = {};
        ["Operating", "Investing", "Financing"].forEach(act => {
            activitiesArray[act] = {
                ...activities[act],
                inflow: Object.values(activities[act].inflow).map((g: any) => ({ ...g, type: "INFLOW", ledgers: Object.values(g.ledgers) })),
                outflow: Object.values(activities[act].outflow).map((g: any) => ({ ...g, type: "OUTFLOW", ledgers: Object.values(g.ledgers) }))
            };
        });

        return {
            months,
            totals,
            openingBreakdown: reportData.opening_ledger_breakdown || [],
            activities: activitiesArray
        };
    }, [showReport, reportData, activeMonthKeys]);


    // ------------------------------------------------------------------ //
    // Dimension-wise data (department / project)                          //
    // ------------------------------------------------------------------ //
    const dimensionData = useMemo(() => {
        if (!showReport || !groupBy || !reportData?.data) return null;

        const monthList = activeMonthKeys;

        if (monthList.length === 0) {
            const monthSet = new Set<string>();
            reportData.data.forEach((item: CashFlowRow) => monthSet.add(item.month_key));
            const fallback = Array.from(monthSet).sort();
            if (fallback.length === 0) return null;
            monthList.push(...fallback);
        }


        const monthCols = monthList.map(m => ({ 
            key: m, 
            label: formatMonthName(m),
            rangeLabel: getMonthRangeLabel(m)
        }));

        // Collect all dimension names
        const dimSet = new Set<string>();
        reportData.data.forEach((item: CashFlowRow) => {
            if (monthList.includes(item.month_key)) {
                const dim = (groupBy === "ledger") 
                    ? (item.ledger_name || "(Unknown Ledger)")
                    : (item.dimension_name || `(No ${groupBy === "department" ? "Department" : "Project"})`);
                dimSet.add(dim);
            }
        });
        const dimensions = Array.from(dimSet).sort();

        // For each dimension: income per month, expense per month, net per month
        const dimMap: Record<string, { inflow: Record<string, number>; outflow: Record<string, number>; net: Record<string, number>; totalIncome: number; totalExpense: number; totalNet: number }> = {};

        dimensions.forEach(dim => {
            dimMap[dim] = {
                inflow: Object.fromEntries(monthList.map(m => [m, 0])),
                outflow: Object.fromEntries(monthList.map(m => [m, 0])),
                net: Object.fromEntries(monthList.map(m => [m, 0])),
                totalIncome: 0,
                totalExpense: 0,
                totalNet: 0,
            };
        });

        // Overall totals per month
        const overallIncome: Record<string, number> = Object.fromEntries(monthList.map(m => [m, 0]));
        const overallExpense: Record<string, number> = Object.fromEntries(monthList.map(m => [m, 0]));
        const overallNet: Record<string, number> = Object.fromEntries(monthList.map(m => [m, 0]));
        let grandIncome = 0, grandExpense = 0, grandNet = 0;

        const processedDimData = reportData.data.map((item: CashFlowRow) => {
            if (item.group_type === "OUTFLOW" && item.group_name.toLowerCase() === "sundry debtors") {
                return { ...item, group_type: "INFLOW" as const, amount: -item.amount };
            }
            return item;
        });

        processedDimData.forEach((item: CashFlowRow) => {
            if (!monthList.includes(item.month_key)) return;
            const dim = (groupBy === "ledger") 
                ? (item.ledger_name || "(Unknown Ledger)")
                : (item.dimension_name || `(No ${groupBy === "department" ? "Department" : "Project"})`);
            if (!dimMap[dim]) return;

            if (item.group_type === "INFLOW") {
                dimMap[dim].inflow[item.month_key] = (dimMap[dim].inflow[item.month_key] || 0) + item.amount;
                dimMap[dim].net[item.month_key] = (dimMap[dim].net[item.month_key] || 0) + item.amount;
                dimMap[dim].totalIncome += item.amount;
                dimMap[dim].totalNet += item.amount;
                overallIncome[item.month_key] += item.amount;
                overallNet[item.month_key] += item.amount;
                grandIncome += item.amount;
                grandNet += item.amount;
            } else {
                dimMap[dim].outflow[item.month_key] = (dimMap[dim].outflow[item.month_key] || 0) + item.amount;
                dimMap[dim].net[item.month_key] = (dimMap[dim].net[item.month_key] || 0) - item.amount;
                dimMap[dim].totalExpense += item.amount;
                dimMap[dim].totalNet -= item.amount;
                overallExpense[item.month_key] += item.amount;
                overallNet[item.month_key] -= item.amount;
                grandExpense += item.amount;
                grandNet -= item.amount;
            }
        });

        // Sort dimensions by totalNet desc
        dimensions.sort((a, b) => (dimMap[b]?.totalNet ?? 0) - (dimMap[a]?.totalNet ?? 0));

        return {
            months: monthCols,
            dimensions,
            dimMap,
            overallIncome,
            overallExpense,
            overallNet,
            grandIncome,
            grandExpense,
            grandNet,
        };
    }, [reportData, effectiveDisplayMode, selectedMonths, showReport, groupBy, fromDate, toDate, toDisplayDate, getMonthKeyRange, activeMonthKeys]);

    const handleToday = () => {
        const { from, to } = getSmartDefaultPeriod(effectiveDisplayMode, currentCompany);
        setFromDate(from);
        setToDate(to);
        setShowReport(true);
    };

    const handleReset = () => {
        setFromDate("");
        setToDate("");
        setSelectedMonths([]);
        setDepartmentFilter("");
        setProjectFilter("");
        setSegmentFilter("");
        setAccountTypeFilter("all");
        setShowReport(false);
    };

    const formatNumber = (num: number) => {
        if (num === 0) return "-";
        return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
    };

    // Standardized formatDateDisplay is already defined above

    const handleExportCSV = () => {
        if (!reportData || mappedData.months.length === 0) return;

        const csvRows: string[] = [];
        csvRows.push(`Company: ${currentCompany?.name || ""}`);
        csvRows.push(`Cash Flow Report`);
        if (reportSubtitle) csvRows.push(`${reportSubtitle}`);
        csvRows.push(`From ${formatDateDisplay(fromDate)} to ${formatDateDisplay(toDate)}`);
        csvRows.push("");

        const headers = ["Activity / Account Group / Ledger", ...mappedData.months.map(m => m.label), "Total"];
        csvRows.push(headers.map(h => `"${h}"`).join(","));

        Object.entries(mappedData.activities).forEach(([actName, actData]: [any, any]) => {
            const hasData = actData.inflow.length > 0 || actData.outflow.length > 0;
            if (!hasData) return;

            csvRows.push(`"CASH FLOW FROM ${actName.toUpperCase()} ACTIVITIES",${mappedData.months.map(() => '""').join(",")},""`);
            
            const addGroups = (groups: any[], label: string) => {
                groups.forEach(group => {
                    csvRows.push(`"${group.name} (${label})",${mappedData.months.map(m => formatNumber(group.monthly[m.key] || 0)).join(",")},"${formatNumber(group.total)}"`);
                    if (viewType === "matrix_detailed") {
                        group.ledgers.forEach((ledger: any) => {
                            csvRows.push(`"  ${ledger.name}",${mappedData.months.map(m => formatNumber(ledger.monthly[m.key] || 0)).join(",")},"${formatNumber(ledger.total)}"`);
                        });
                    }
                });
            };

            addGroups(actData.inflow, "Receipts");
            addGroups(actData.outflow, "Payments");
            
            csvRows.push(`"NET CASH FROM ${actName.toUpperCase()}",${mappedData.months.map(m => formatNumber(actData.net[m.key])).join(",")},"${formatNumber(actData.totalNet)}"`);
            csvRows.push("");
        });

        csvRows.push(`"NET INCREASE / (DECREASE) IN CASH",${mappedData.months.map(m => formatNumber(mappedData.totals.NET[m.key])).join(",")},"${formatNumber(mappedData.totals.OVERALL_NET)}"`);
        csvRows.push(`"Opening Balance",${mappedData.months.map(m => formatNumber(mappedData.totals.OPENING[m.key])).join(",")},"${formatNumber(mappedData.totals.OVERALL_OPENING)}"`);
        csvRows.push(`"CLOSING BALANCE",${mappedData.months.map(m => formatNumber(mappedData.totals.CLOSING[m.key])).join(",")},"${formatNumber(mappedData.totals.OVERALL_CLOSING)}"`);

        const csvContent = csvRows.join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "cash-flow-report.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handlePrint = () => {
        if (typeof window === "undefined") return;
        openPrintWindow({
            contentHtml: printRef.current?.innerHTML ?? "",
            title: "Cash Flow Report",
            company: currentCompany?.name || (company as any)?.name || "",
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
                                <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Cash Flow Report</h1>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">Month-wise grouping report</p>
                            </div>
                        </div>
                    </div>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                    You do not have permission to view this report.
                </p>
            </div>
        );
    }

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
                            <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Cash Flow Report</h1>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">Cash Inflow & Outflow grouped by Month</p>
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

            {/* Filter Panel */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm bg-slate-50/50 dark:bg-slate-900/50">
                {/* Filter Panel Header */}
                <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-t-2xl">
                    <span className="text-slate-800 dark:text-slate-200 text-sm font-semibold tracking-wide">🔍 Report Filters</span>
                    <div className="flex items-center gap-2 ml-auto print-hidden">
                        <button
                            type="button"
                            onClick={handlePrint}
                            className="flex items-center gap-1.5 h-8 rounded-lg px-3 text-xs font-medium border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
                        >
                            🖨️ Print
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
                                className="h-8 rounded-r-lg px-3 text-xs font-semibold text-white transition-all shadow-sm bg-indigo-600 hover:bg-indigo-700"
                            >
                                ↓ Download
                            </button>
                        </div>
                    </div>
                </div>

                {/* Filter Body */}
                <div className="px-4 py-3">
                    <div className="flex flex-col gap-4 text-sm">
                        {/* Report Filter & Selection Row */}
                        <div className="flex flex-wrap items-end gap-5 p-4 bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date Display</label>
                                <select
                                    className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs h-9 min-w-[90px] shadow-sm focus:ring-2 focus:ring-indigo-500/20 transition-all font-semibold outline-none border-t-2 border-t-indigo-500"
                                    value={effectiveDisplayMode}
                                    onChange={(e) => {
                                        if (!companyId) return;
                                        if (dateDisplayMode !== "BOTH") return;
                                        const next = e.target.value as CalendarReportDisplayMode;
                                        setReportDisplayMode(next);
                                        writeCalendarReportDisplayMode(companyId, next);
                                    }}
                                    disabled={dateDisplayMode !== "BOTH"}
                                >
                                    {dateDisplayMode === "BOTH" ? (
                                        <>
                                            <option value="AD">AD (Gregorian)</option>
                                            <option value="BS">BS (Bikram Sambat)</option>
                                        </>
                                    ) : (
                                        <option value={effectiveDisplayMode}>{effectiveDisplayMode}</option>
                                    )}
                                </select>
                            </div>

                            <div className="flex flex-col gap-1.5 border-l border-slate-200 dark:border-slate-800 pl-5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Report Filter</label>
                                <select
                                    className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs h-9 min-w-[140px] shadow-sm focus:ring-2 focus:ring-indigo-500/20 transition-all font-bold outline-none border-t-2 border-t-indigo-500"
                                    value={filterMode}
                                    onChange={(e) => setFilterMode(e.target.value as any)}
                                >
                                    <option value="MONTH">Month Wise View</option>
                                    <option value="PERIOD">Custom Date Range</option>
                                </select>
                            </div>

                            <div className="h-9 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1 hidden lg:block" />

                            {filterMode === "MONTH" ? (
                                <div className="flex-1 min-w-[400px]">
                                    <label className="block mb-1.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest pl-1">Select Reporting Months</label>
                                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-inner-sm">
                                        <label className="flex items-center gap-2.5 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                className="h-4.5 w-4.5 accent-indigo-600 rounded cursor-pointer transition-all group-hover:scale-110 shadow-sm"
                                                checked={selectedMonths.length === presetMonths.length && presetMonths.length > 0}
                                                onChange={() => handleMonthToggle("ALL")}
                                            />
                                            <span className="text-xs font-black text-slate-900 dark:text-slate-100 tracking-tight">Select All</span>
                                        </label>
                                        <div className="h-5 w-[2px] bg-slate-100 dark:bg-slate-800 mx-1" />
                                        {presetMonths.map((pm) => (
                                            <label key={pm.value} className="flex items-center gap-2 cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    className="h-4.5 w-4.5 accent-indigo-600 rounded cursor-pointer transition-all group-hover:scale-110 shadow-sm"
                                                    checked={selectedMonths.includes(pm.value)}
                                                    onChange={() => handleMonthToggle(pm.value)}
                                                />
                                                <span className={`text-[11px] whitespace-nowrap transition-colors ${selectedMonths.includes(pm.value) ? 'font-bold text-indigo-700 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-700'}`}>
                                                    {pm.label}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-wrap items-end gap-3 flex-1">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">From Period</label>
                                        {effectiveDisplayMode === "BS" ? (
                                            <NepaliDatePicker
                                                inputClassName="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 h-9 font-medium shadow-sm transition-all focus:ring-1 focus:ring-indigo-500 outline-none"
                                                value={fromDate}
                                                onChange={(value: string) => handleCustomFromDate(value)}
                                                options={{ calenderLocale: 'ne', valueLocale: 'en' }}
                                                // @ts-ignore
                                                minDate={currentCompany?.fiscal_year_start ? (safeADToBS(currentCompany.fiscal_year_start) || "") : ""}
                                                // @ts-ignore
                                                maxDate={currentCompany?.fiscal_year_end ? (safeADToBS(currentCompany.fiscal_year_end) || "") : ""}
                                            />
                                        ) : (
                                            <Input forceNative type="date"
                                                className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs h-9 font-medium shadow-sm"
                                                value={fromDate}
                                                min={currentCompany?.fiscal_year_start || ""}
                                                max={currentCompany?.fiscal_year_end || ""}
                                                onChange={(e) => handleCustomFromDate(e.target.value)}
                                            />
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">To Period</label>
                                        {effectiveDisplayMode === "BS" ? (
                                            <NepaliDatePicker
                                                inputClassName="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 h-9 font-medium shadow-sm transition-all focus:ring-1 focus:ring-indigo-500 outline-none"
                                                value={toDate}
                                                onChange={(value: string) => handleCustomToDate(value)}
                                                options={{ calenderLocale: 'ne', valueLocale: 'en' }}
                                                // @ts-ignore
                                                minDate={currentCompany?.fiscal_year_start ? (safeADToBS(currentCompany.fiscal_year_start) || "") : ""}
                                                // @ts-ignore
                                                maxDate={currentCompany?.fiscal_year_end ? (safeADToBS(currentCompany.fiscal_year_end) || "") : ""}
                                            />
                                        ) : (
                                            <Input forceNative type="date"
                                                className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs h-9 font-medium shadow-sm"
                                                value={toDate}
                                                min={currentCompany?.fiscal_year_start || ""}
                                                max={currentCompany?.fiscal_year_end || ""}
                                                onChange={(e) => handleCustomToDate(e.target.value)}
                                            />
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Row 2: View/Classification Filters & Action Buttons */}
                        <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-3">
                            <div>
                                <label className="block mb-1 text-xs font-medium text-slate-700 dark:text-slate-300">Account Type</label>
                                <select
                                    value={accountTypeFilter}
                                    onChange={(e) => setAccountTypeFilter(e.target.value as "all" | "cash" | "bank")}
                                    className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs min-w-[140px] h-8 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                                >
                                    <option value="all">All (Cash + Bank)</option>
                                    <option value="cash">Cash Only</option>
                                    <option value="bank">Bank Only</option>
                                </select>
                            </div>

                            <div>
                                <label className="block mb-1 text-xs font-medium text-slate-700 dark:text-slate-300">View By</label>
                                <select
                                    value={groupBy}
                                    onChange={(e) => setGroupBy(e.target.value as any)}
                                    className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs min-w-[140px] h-8 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                                >
                                    <option value="">No Matrix (Default)</option>
                                    <option value="ledger">Ledger-wise Matrix</option>
                                    <option value="department">Department-wise Matrix</option>
                                    <option value="project">Project-wise Matrix</option>
                                </select>
                            </div>

                            <div>
                                <label className="block mb-1 text-xs font-medium text-slate-700 dark:text-slate-300">Report Type</label>
                                <select
                                    value={viewType}
                                    onChange={(e) => setViewType(e.target.value as any)}
                                    className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs min-w-[140px] h-8 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                                >
                                    <option value="matrix_detailed">Matrix Detailed</option>
                                    <option value="matrix_summary">Matrix Summary</option>
                                    <option value="detailed">Transaction-wise Detailed</option>
                                    <option value="summary">Summary (Ledger-wise)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block mb-1 text-xs font-medium text-slate-700 dark:text-slate-300">Department</label>
                                <select
                                    value={departmentFilter}
                                    onChange={(e) => setDepartmentFilter(e.target.value)}
                                    className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs min-w-[160px] h-8 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                                >
                                    <option value="">All Departments</option>
                                    {Array.isArray(departments) && departments.map((dept: any) => (
                                        <option key={dept.id} value={dept.id}>
                                            {dept.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block mb-1 text-xs font-medium text-slate-700 dark:text-slate-300">Project</label>
                                <select
                                    value={projectFilter}
                                    onChange={(e) => setProjectFilter(e.target.value)}
                                    className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs min-w-[160px] h-8 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                                >
                                    <option value="">All Projects</option>
                                    {Array.isArray(projects) && projects.map((proj: any) => (
                                        <option key={proj.id} value={proj.id}>
                                            {proj.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block mb-1 text-xs font-medium text-slate-700 dark:text-slate-300">Segment</label>
                                <select
                                    value={segmentFilter}
                                    onChange={(e) => setSegmentFilter(e.target.value)}
                                    className="border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs min-w-[160px] h-8 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                                >
                                    <option value="">All Segments</option>
                                    {Array.isArray(segments) && segments.map((seg: any) => (
                                        <option key={seg.id} value={seg.id}>
                                            {seg.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex gap-2 ml-auto">
                                <button
                                    type="button"
                                    className="px-5 py-1 h-8 rounded border border-green-300 dark:border-green-700 text-white bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 text-xs font-bold shadow-sm transition-all"
                                    onClick={handleShow}
                                >
                                    Show
                                </button>
                                <button
                                    type="button"
                                    className="px-3 py-1 h-8 rounded border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-xs font-medium"
                                    onClick={handleToday}
                                >
                                    Today
                                </button>
                                <button
                                    type="button"
                                    className="px-3 py-1 h-8 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs shadow-sm"
                                    onClick={handleReset}
                                >
                                    Reset
                                </button>
                                <div className="relative group">
                                    <button
                                        type="button"
                                        className="p-1.5 h-8 w-8 flex items-center justify-center rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-600 dark:text-slate-400"
                                        title="Configure Statistics"
                                    >
                                        ⚙️
                                    </button>
                                    <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-[60] p-2 hidden group-hover:block border-t-4 border-t-indigo-500">
                                        <div className="px-2 py-1.5 border-b border-slate-100 dark:border-slate-700 mb-1">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Summary Rows</span>
                                        </div>
                                        {[
                                            { id: "received_debtors", label: "Total Amount Received From Debtors" },
                                            { id: "received_cash", label: "Amount Received in Cash" },
                                            { id: "received_bank", label: "Amount Received in Bank" },
                                            { id: "amount_receivable", label: "Amount Receivable (Closing)" },
                                            { id: "paid_suppliers", label: "Total Amount Paid to Suppliers" },
                                            { id: "total_received", label: "Total Inflow (Receipts)" },
                                            { id: "total_paid", label: "Total Outflow (Payments)" },
                                            { id: "withdrawn_bank", label: "Amount Received from Bank (Withdrawal)" },
                                            { id: "deposited_bank", label: "Amount Deposited in Bank (Deposit)" },
                                            { id: "net_cash_flow", label: "Net Movement In Period" },
                                        ].map(row => (
                                            <label key={row.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded cursor-pointer transition-colors">
                                                <input
                                                    type="checkbox"
                                                    className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                    checked={selectedStatCards.includes(row.id)}
                                                    onChange={() => {
                                                        setSelectedStatCards(prev =>
                                                            prev.includes(row.id) ? prev.filter(id => id !== row.id) : [...prev, row.id]
                                                        );
                                                    }}
                                                />
                                                <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">{row.label}</span>
                                            </label>
                                        ))}
                                        <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                                            <button
                                                onClick={() => setShowSummaryCards(!showSummaryCards)}
                                                className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-bold ${showSummaryCards ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                                            >
                                                {showSummaryCards ? "🙈 Hide Summary Table" : "👁️ Show Summary Table"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                </div>
                </div>
            </div>

            <div ref={printRef} className="border border-slate-200 dark:border-slate-800 rounded p-4 min-h-[400px]">
                {!showReport ? (
                    <div className="flex flex-col items-center justify-center h-[300px] text-slate-500">
                        <div className="text-4xl mb-4">📊</div>
                        <p className="text-sm font-medium">Select a date range and click &apos;Show&apos; to generate the report</p>
                    </div>
                ) : reportError ? (
                    <div className="text-red-600 dark:text-red-400">
                        Error loading report: {reportError.message || "Unknown error"}
                    </div>
                ) : !reportData ? (
                    <div className="flex flex-col items-center justify-center h-[300px] text-slate-500">
                        <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin mb-4" />
                        <p className="text-sm">Fetching Cash Flow data...</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="text-center border-b border-slate-200 dark:border-slate-800 pb-3">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{currentCompany?.name || ""}</h2>
                            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mt-1">
                                Cash Flow Report
                            </h3>
                            {reportSubtitle && (
                                <p className="text-xs font-medium text-indigo-700 dark:text-indigo-400 mt-0.5">
                                    {reportSubtitle}
                                </p>
                            )}
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                From {formatDateDisplay(fromDate)} to {formatDateDisplay(toDate)}
                            </p>
                        </div>

                        {/* ---- Monthly Summary Statistics Table ---- */}
                        {showSummaryCards && summaryStats && (
                            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/30 dark:bg-slate-900/10">
                                <table className="w-full text-[11px] border-collapse">
                                    <thead>
                                        <tr className="bg-slate-100/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800">
                                            <th className="py-2 px-3 text-left font-bold text-slate-700 dark:text-slate-300 sticky left-0 bg-slate-100 dark:bg-slate-800 min-w-[220px] shadow-[2px_0_5px_rgba(0,0,0,0.05)]">Financial Metric</th>
                                            {mappedData.months.map((m: any) => (
                                                <th key={m.key} className="py-2 px-3 text-right font-bold text-slate-600 dark:text-slate-400 border-l border-slate-200 dark:border-slate-800 min-w-[100px]">{m.label}</th>
                                            ))}
                                            <th className="py-2 px-3 text-right font-bold text-indigo-700 dark:text-indigo-400 border-l border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/30 dark:bg-indigo-900/10 min-w-[110px]">Overall</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                        {[
                                            { id: "received_debtors", label: "Cash Receipts from Customers", color: "text-emerald-700 dark:text-emerald-400 font-semibold" },
                                            { id: "received_cash", label: "Of which: Cash Receipts", color: "text-slate-500 dark:text-slate-400 pl-4" },
                                            { id: "received_bank", label: "Of which: Bank Receipts", color: "text-slate-500 dark:text-slate-400 pl-4" },
                                            { id: "paid_suppliers", label: "Cash Payments to Suppliers/Vendors", color: "text-rose-700 dark:text-rose-400 font-semibold" },
                                            { id: "total_received", label: "TOTAL OPERATING RECEIPTS", color: "text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50/20 dark:bg-emerald-900/5" },
                                            { id: "total_paid", label: "TOTAL OPERATING PAYMENTS", color: "text-rose-700 dark:text-rose-400 font-bold bg-rose-50/20 dark:bg-rose-900/5" },
                                            { id: "net_cash_flow", label: "NET INCREASE / (DECREASE) IN CASH", color: "font-bold bg-indigo-50/40 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400" },
                                            { id: "amount_receivable", label: "Total Receivables Balance (at end of month)", color: "text-amber-700 dark:text-amber-500 font-medium italic border-t border-slate-200 dark:border-slate-800" },
                                        ].filter(row => selectedStatCards.includes(row.id)).map(row => (
                                            <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-200 dark:border-slate-800">
                                                <td className="py-2 px-3 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-900 shadow-[1px_0_3px_rgba(0,0,0,0.05)] border-r-2 border-slate-200 dark:border-slate-800 whitespace-nowrap">{row.label}</td>
                                                {mappedData.months.map((m: any) => (
                                                    <td key={`${row.id}_${m.key}`} className={`py-2 px-3 text-right font-mono border-r border-slate-200 dark:border-slate-800/30 ${row.color}`}>
                                                        {formatNumber((summaryStats as any)[m.key]?.[row.id] || 0)}
                                                    </td>
                                                ))}
                                                <td className={`py-2 px-3 text-right font-bold bg-indigo-50/20 dark:bg-indigo-900/5 ${row.color && !row.color.includes('bg') ? row.color : (row.id === 'net_cash_flow' ? ((summaryStats as any).OVERALL[row.id] < 0 ? 'text-rose-600' : 'text-indigo-600') : '')}`}>
                                                    {formatNumber((summaryStats as any).OVERALL[row.id] || 0)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="overflow-x-auto">
                            {viewType === "detailed" ? (
                                <table className="w-full text-[11px] border-collapse border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                                    <thead className="bg-slate-50 dark:bg-slate-800/50">
                                        <tr>
                                            <th className="py-2 px-3 text-left font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">Date</th>
                                            <th className="py-2 px-3 text-left font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">Voucher Type</th>
                                            <th className="py-2 px-3 text-left font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">Ledger Particulars</th>
                                            <th className="py-2 px-3 text-left font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">Account Group</th>
                                            <th className="py-2 px-3 text-left font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">Dimension</th>
                                            <th className="py-2 px-3 text-right font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 min-w-[100px]">Inflow</th>
                                            <th className="py-2 px-3 text-right font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 min-w-[100px]">Outflow</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                        {reportData.data.map((item: any, idx: number) => (
                                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                                <td className="py-1.5 px-3 whitespace-nowrap border-r border-slate-200">{formatDateDisplay(item.voucher_date)}</td>
                                                <td className="py-1.5 px-3 text-[10px] text-slate-500 border-r border-slate-100">{item.voucher_type}</td>
                                                <td className="py-1.5 px-3 font-medium text-slate-800 dark:text-slate-200 border-r border-slate-100">{item.ledger_name}</td>
                                                <td className="py-1.5 px-3 text-[10px] text-slate-500 border-r border-slate-100">{item.group_name}</td>
                                                <td className="py-1.5 px-3 text-[10px] text-indigo-600 dark:text-indigo-400 border-r border-slate-100">{item.dimension_name || "-"}</td>
                                                <td className="py-1.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 border-r border-slate-100">
                                                    {item.group_type === "INFLOW" ? formatNumber(item.amount) : "-"}
                                                </td>
                                                <td className="py-1.5 px-3 text-right font-mono text-rose-600 dark:text-rose-400">
                                                    {item.group_type === "OUTFLOW" ? formatNumber(item.amount) : "-"}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : viewType === "summary" ? (
                                <div className="space-y-4">
                                    <table className="w-full text-xs border-collapse border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm">
                                        <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                            <tr>
                                                <th className="py-2.5 px-4 text-left font-bold border-b border-slate-200 dark:border-slate-700 uppercase tracking-tight text-[10px]">Ledger Name</th>
                                                <th className="py-2.5 px-4 text-left font-bold border-b border-slate-200 dark:border-slate-700 uppercase tracking-tight text-[10px]">Account Head & Activity</th>
                                                <th className="py-2.5 px-4 text-right font-bold border-b border-slate-200 dark:border-slate-700 uppercase tracking-tight text-[10px] min-w-[120px]">Receipts (Inflow)</th>
                                                <th className="py-2.5 px-4 text-right font-bold border-b border-slate-200 dark:border-slate-700 uppercase tracking-tight text-[10px] min-w-[120px]">Payments (Outflow)</th>
                                                <th className="py-2.5 px-4 text-right font-bold border-b border-slate-200 dark:border-slate-700 uppercase tracking-tight text-[10px] min-w-[120px]">Net Movement</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                            {(() => {
                                                const flattened = Object.entries(mappedData.activities).flatMap(([actName, actData]: [any, any]) => 
                                                    [...actData.inflow, ...actData.outflow].flatMap(group => 
                                                        group.ledgers.map((l: any) => ({
                                                            ledgerName: l.name,
                                                            groupName: group.name,
                                                            activity: actName,
                                                            type: group.type,
                                                            total: l.total
                                                        }))
                                                    )
                                                ).sort((a, b) => a.ledgerName.localeCompare(b.ledgerName));

                                                if (flattened.length === 0) {
                                                    return (
                                                        <tr>
                                                            <td colSpan={5} className="py-12 text-center text-slate-400 italic">
                                                                No ledger-level transactions found for the selected criteria.
                                                            </td>
                                                        </tr>
                                                    );
                                                }

                                                return flattened.map((item, idx) => (
                                                    <tr key={`${item.ledgerName}_${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 group transition-colors">
                                                        <td className="py-2 px-4 font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/30 transition-colors">
                                                            {item.ledgerName}
                                                        </td>
                                                        <td className="py-2 px-4">
                                                            <div className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{item.groupName}</div>
                                                            <div className="text-[9px] uppercase font-medium text-slate-400 dark:text-slate-500">{item.activity} Activity</div>
                                                        </td>
                                                        <td className="py-2 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400">
                                                            {item.type === "INFLOW" ? formatNumber(item.total) : "-"}
                                                        </td>
                                                        <td className="py-2 px-4 text-right font-mono text-rose-600 dark:text-rose-400">
                                                            {item.type === "OUTFLOW" ? formatNumber(item.total) : "-"}
                                                        </td>
                                                        <td className={`py-2 px-4 text-right font-mono font-bold ${item.type === "INFLOW" ? "text-emerald-700 dark:text-emerald-500" : "text-rose-700 dark:text-rose-500"}`}>
                                                            {item.type === "INFLOW" ? "+" : "-"}{formatNumber(item.total)}
                                                        </td>
                                                    </tr>
                                                ));
                                            })()}
                                        </tbody>
                                        <tfoot className="bg-slate-50 dark:bg-slate-800/30 font-bold">
                                            <tr className="border-t-2 border-slate-200 dark:border-slate-700">
                                                <td colSpan={2} className="py-3 px-4 text-slate-700 dark:text-slate-300 text-xs text-right">Grand Total Movement</td>
                                                <td className="py-3 px-4 text-right text-emerald-700 dark:text-emerald-400 font-mono text-xs">{formatNumber(mappedData.totals.OVERALL_INFLOW)}</td>
                                                <td className="py-3 px-4 text-right text-rose-700 dark:text-rose-400 font-mono text-xs">{formatNumber(mappedData.totals.OVERALL_OUTFLOW)}</td>
                                                <td className={`py-3 px-4 text-right font-mono text-xs ${mappedData.totals.OVERALL_NET >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                                                    {formatNumber(mappedData.totals.OVERALL_NET)}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            ) : groupBy && dimensionData ? (
                                <table className="w-full text-xs border-collapse border border-slate-300 dark:border-slate-700">
                                    <thead>
                                        <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700">
                                            <th className="py-2 px-3 text-left font-semibold text-slate-700 dark:text-slate-300 border-r border-slate-300 dark:border-slate-700 sticky left-0 bg-slate-100 dark:bg-slate-800 min-w-[180px]">
                                                {groupBy === "department" ? "Department" : groupBy === "project" ? "Project" : "Ledger Name"}
                                            </th>
                                            <th className="py-2 px-2 text-center font-semibold text-slate-700 dark:text-slate-300 border-r border-slate-300 dark:border-slate-700 min-w-[70px]">Type</th>
                                            {dimensionData.months.map(m => (
                                                <th key={m.key} className="py-2 px-3 text-right font-semibold text-slate-700 dark:text-slate-300 border-r border-slate-300 dark:border-slate-700 min-w-[100px]">
                                                    <div className="leading-tight">{m.label}</div>
                                                    <div className="text-[9px] font-normal opacity-70 leading-tight">{m.rangeLabel}</div>
                                                </th>
                                            ))}
                                            <th className="py-2 px-3 text-right font-semibold text-slate-700 dark:text-slate-300 min-w-[100px]">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dimensionData.dimensions.map((dim, dIdx) => {
                                            const d = dimensionData.dimMap[dim];
                                            return (
                                                <React.Fragment key={`dim_${dIdx}`}>
                                                    <tr className="bg-green-50/40 dark:bg-green-900/10 border-b border-slate-200 dark:border-slate-800">
                                                        <td rowSpan={3} className="py-1.5 px-3 font-semibold text-slate-800 dark:text-slate-200 sticky left-0 bg-green-50/95 dark:bg-slate-900/90 border-r-2 border-slate-200 dark:border-slate-700 align-top pt-3">{dim}</td>
                                                        <td className="py-1.5 px-2 text-center text-xs font-medium text-green-700 dark:text-green-400 border-r border-slate-200 dark:border-slate-700">Inflow</td>
                                                        {dimensionData.months.map(m => (
                                                            <td key={`di_${m.key}`} className="py-1.5 px-3 text-right font-mono text-green-700 dark:text-green-400 border-r border-slate-200 dark:border-slate-700/50">{formatNumber(d.inflow[m.key] || 0)}</td>
                                                        ))}
                                                        <td className="py-1.5 px-3 text-right font-bold text-green-700 dark:text-green-400 border-l border-slate-200">{formatNumber(d.totalIncome)}</td>
                                                    </tr>
                                                    <tr className="bg-red-50/30 dark:bg-red-900/10 border-b border-slate-200 dark:border-slate-800">
                                                        <td className="py-1.5 px-2 text-center text-xs font-medium text-red-700 dark:text-red-400 border-r border-slate-200 dark:border-slate-700">Outflow</td>
                                                        {dimensionData.months.map(m => (
                                                            <td key={`de_${m.key}`} className="py-1.5 px-3 text-right font-mono text-red-700 dark:text-red-400 border-r border-slate-200 dark:border-slate-700/50">{formatNumber(d.outflow[m.key] || 0)}</td>
                                                        ))}
                                                        <td className="py-1.5 px-3 text-right font-bold text-red-700 dark:text-red-400 border-l border-slate-200">{formatNumber(d.totalExpense)}</td>
                                                    </tr>
                                                    <tr className="border-b-2 border-slate-300 dark:border-slate-700">
                                                        <td className="py-1.5 px-2 text-center text-xs font-bold text-blue-700 dark:text-blue-400 border-r border-slate-200 dark:border-slate-700">Net</td>
                                                        {dimensionData.months.map(m => (
                                                            <td key={`dn_${m.key}`} className={`py-1.5 px-3 text-right font-bold border-r border-slate-200 dark:border-slate-700/50 ${(d.net[m.key] || 0) < 0 ? 'text-red-700 dark:text-red-400' : 'text-blue-700 dark:text-blue-400'}`}>{formatNumber(d.net[m.key] || 0)}</td>
                                                        ))}
                                                        <td className={`py-1.5 px-3 text-right font-bold border-l border-slate-200 ${d.totalNet < 0 ? 'text-red-700 dark:text-red-400' : 'text-blue-700 dark:text-blue-400'}`}>{formatNumber(d.totalNet)}</td>
                                                    </tr>
                                                </React.Fragment>
                                            );
                                        })}
                                        {dimensionData.grandNet !== 0 && (
                                            <tr className="bg-blue-100 dark:bg-blue-900/40 font-bold border-t-2 border-blue-200">
                                                <td colSpan={2} className="py-2 px-3 text-blue-900 dark:text-blue-100 sticky left-0 bg-blue-100 dark:bg-blue-900 border-r border-blue-200">GRAND TOTAL NET</td>
                                                {dimensionData.months.map(m => (
                                                    <td key={`gt_${m.key}`} className="py-2 px-3 text-right border-r border-blue-200/50">{formatNumber(dimensionData.overallNet[m.key])}</td>
                                                ))}
                                                <td className="py-2 px-3 text-right">{formatNumber(dimensionData.grandNet)}</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            ) : (
                                <table className="w-full text-xs border-collapse border border-slate-300 dark:border-slate-700 rounded overflow-hidden">
                                    <thead>
                                        <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700">
                                            <th className="py-2 px-3 text-left font-bold text-slate-700 dark:text-slate-300 border-r border-slate-300 dark:border-slate-700 sticky left-0 bg-slate-100 dark:bg-slate-800 min-w-[200px] z-30">Activity / Account Heads</th>
                                            {mappedData.months.map(m => (
                                                <th key={m.key} className="py-2 px-3 text-right font-bold text-slate-700 dark:text-slate-300 border-r border-slate-300 dark:border-slate-700 min-w-[100px]">
                                                    <div className="leading-tight">{m.label}</div>
                                                    <div className="text-[9px] font-normal opacity-70 leading-tight">{m.rangeLabel}</div>
                                                </th>
                                            ))}
                                            <th className="py-2 px-3 text-right font-bold text-slate-700 dark:text-slate-300 min-w-[100px]">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                        {/* Activity Sections */}
                                        {Object.entries(mappedData.activities).map(([actName, actData]: [any, any]) => {
                                            const hasData = actData.inflow.length > 0 || actData.outflow.length > 0;
                                            if (!hasData) return null;
                                            return (
                                                <React.Fragment key={actName}>
                                                    <tr className="bg-indigo-50/50 dark:bg-indigo-900/20 border-t-2 border-slate-300 dark:border-slate-700">
                                                        <td colSpan={mappedData.months.length + 2} className="py-2 px-3 font-bold text-indigo-900 dark:text-indigo-200 uppercase tracking-wider sticky left-0 z-20 bg-indigo-50 dark:bg-slate-900 border-b border-indigo-100 dark:border-indigo-900/50">
                                                            CASH FLOW FROM {actName.toUpperCase()} ACTIVITIES
                                                        </td>
                                                    </tr>
                                                    {/* Inflows within Activity */}
                                                    {actData.inflow.length > 0 && actData.inflow.map((group: any) => (
                                                        <React.Fragment key={group.name}>
                                                            <tr className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800/50">
                                                                <td className="py-1.5 px-3 font-semibold text-slate-800 dark:text-slate-200 sticky left-0 bg-white dark:bg-slate-950 border-r-2 border-slate-200 dark:border-slate-800">{group.name} (Receipts)</td>
                                                                {mappedData.months.map(m => (
                                                                    <td key={m.key} className="py-1.5 px-3 text-right font-semibold text-emerald-700 dark:text-emerald-400 border-r border-slate-200 dark:border-slate-800/50">{formatNumber(group.monthly[m.key])}</td>
                                                                ))}
                                                                <td className="py-1.5 px-3 text-right font-bold text-emerald-700 dark:text-emerald-400 border-l border-slate-200">{formatNumber(group.total)}</td>
                                                            </tr>
                                                            {viewType === "matrix_detailed" && group.ledgers.map((l: any) => (
                                                                <tr key={l.name} className="border-b border-slate-50 dark:border-slate-900 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                                                                    <td className="py-1.2 px-3 pl-8 text-slate-600 dark:text-slate-400 sticky left-0 bg-slate-50/30 dark:bg-slate-950/30 border-r-2 border-slate-200 dark:border-slate-800 italic">{l.name}</td>
                                                                    {mappedData.months.map(m => (
                                                                        <td key={m.key} className="py-1.2 px-3 text-right font-mono text-slate-500 border-r border-slate-200 dark:border-slate-900/50 text-[11px]">{formatNumber(l.monthly[m.key])}</td>
                                                                    ))}
                                                                    <td className="py-1.2 px-3 text-right font-mono text-slate-600 dark:text-slate-400 text-[11px] border-l border-slate-200">{formatNumber(l.total)}</td>
                                                                </tr>
                                                            ))}
                                                        </React.Fragment>
                                                    ))}
                                                    {/* Outflows within Activity */}
                                                    {actData.outflow.length > 0 && actData.outflow.map((group: any) => (
                                                        <React.Fragment key={group.name}>
                                                            <tr className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800/50">
                                                                <td className="py-1.5 px-3 font-semibold text-slate-800 dark:text-slate-200 sticky left-0 bg-white dark:bg-slate-950 border-r-2 border-slate-200 dark:border-slate-800">{group.name} (Payments)</td>
                                                                {mappedData.months.map(m => (
                                                                    <td key={m.key} className="py-1.5 px-3 text-right font-semibold text-rose-700 dark:text-rose-400 border-r border-slate-200 dark:border-slate-800/50">{formatNumber(group.monthly[m.key])}</td>
                                                                ))}
                                                                <td className="py-1.5 px-3 text-right font-bold text-rose-700 dark:text-rose-400 border-l border-slate-200">{formatNumber(group.total)}</td>
                                                            </tr>
                                                            {viewType === "matrix_detailed" && group.ledgers.map((l: any) => (
                                                                <tr key={l.name} className="border-b border-slate-50 dark:border-slate-900 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                                                                    <td className="py-1.2 px-3 pl-8 text-slate-600 dark:text-slate-400 sticky left-0 bg-slate-50/30 dark:bg-slate-950/30 border-r-2 border-slate-200 dark:border-slate-800 italic">{l.name}</td>
                                                                    {mappedData.months.map(m => (
                                                                        <td key={m.key} className="py-1.2 px-3 text-right font-mono text-slate-500 border-r border-slate-200 dark:border-slate-900/50 text-[11px]">{formatNumber(l.monthly[m.key])}</td>
                                                                    ))}
                                                                    <td className="py-1.2 px-3 text-right font-mono text-slate-600 dark:text-slate-400 text-[11px] border-l border-slate-200">{formatNumber(l.total)}</td>
                                                                </tr>
                                                            ))}
                                                        </React.Fragment>
                                                    ))}
                                                    {/* Sub-total for Activity */}
                                                    <tr className="bg-slate-50 dark:bg-slate-800 border-b-2 border-slate-400 dark:border-slate-600">
                                                        <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100 sticky left-0 bg-slate-50 dark:bg-slate-800 border-r border-slate-400 dark:border-slate-600 uppercase text-[11px]">NET CASH FROM {actName.toUpperCase()} ACTIVITIES</td>
                                                        {mappedData.months.map(m => (
                                                            <td key={m.key} className={`py-2.5 px-3 text-right font-bold border-r border-slate-400/50 dark:border-slate-600/50 ${actData.net[m.key] < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-blue-800 dark:text-blue-300'}`}>{formatNumber(actData.net[m.key])}</td>
                                                        ))}
                                                        <td className={`py-2.5 px-3 text-right font-bold ${actData.totalNet < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-blue-900 dark:text-blue-100'}`}>{formatNumber(actData.totalNet)}</td>
                                                    </tr>
                                                </React.Fragment>
                                            );
                                        })}

                                        {/* FINAL RECONCILIATION */}
                                        <tr className="bg-slate-200 dark:bg-slate-700/50 border-t-4 border-slate-400 dark:border-slate-500">
                                            <td className="py-3 px-3 font-bold text-slate-900 dark:text-slate-100 sticky left-0 bg-slate-200 dark:bg-slate-700 border-r border-slate-400 uppercase text-xs">NET INCREASE / (DECREASE) IN CASH</td>
                                            {mappedData.months.map(m => (
                                                <td key={m.key} className={`py-3 px-3 text-right font-bold border-r border-slate-400/50 ${mappedData.totals.NET[m.key] < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-indigo-700 dark:text-indigo-400'}`}>{formatNumber(mappedData.totals.NET[m.key])}</td>
                                            ))}
                                            <td className={`py-3 px-3 text-right font-bold ${mappedData.totals.OVERALL_NET < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-indigo-900 dark:text-indigo-100'}`}>{formatNumber(mappedData.totals.OVERALL_NET)}</td>
                                        </tr>
                                        <tr className="bg-white dark:bg-slate-950 border-t border-slate-300 dark:border-slate-700">
                                            <td className="py-2.5 px-3 font-bold text-slate-700 dark:text-slate-400 sticky left-0 bg-white dark:bg-slate-950 border-r-2 border-slate-300 dark:border-slate-700">Add: Opening Balance (Cash & Bank)</td>
                                            {mappedData.months.map(m => (
                                                <td key={m.key} className="py-2.5 px-3 text-right font-semibold text-slate-600 dark:text-slate-500 border-r border-slate-200 dark:border-slate-700/50">{formatNumber(mappedData.totals.OPENING[m.key])}</td>
                                            ))}
                                            <td className="py-2.5 px-3 text-right font-bold text-slate-700 dark:text-slate-400 border-l border-slate-300">{formatNumber(mappedData.totals.OVERALL_OPENING)}</td>
                                        </tr>
                                        <tr className="bg-slate-100 dark:bg-slate-800 border-t-2 border-slate-400">
                                            <td className="py-3 px-3 font-bold text-slate-900 dark:text-slate-100 sticky left-0 bg-slate-100 dark:bg-slate-800 border-r border-slate-400 uppercase text-xs">CLOSING BALANCE (Cash & Bank)</td>
                                            {mappedData.months.map(m => (
                                                <td key={m.key} className="py-3 px-3 text-right font-black text-slate-900 dark:text-slate-100 border-r border-slate-400/50">{formatNumber(mappedData.totals.CLOSING[m.key])}</td>
                                            ))}
                                            <td className="py-3 px-3 text-right font-black text-slate-900 dark:text-slate-100">{formatNumber(mappedData.totals.OVERALL_CLOSING)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div className="mt-8 flex justify-between items-center text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                            <div>
                                Print by: {currentUser?.full_name || currentUser?.name || currentUser?.email || "System"}
                            </div>
                            <div className="text-center">
                                Approved by: ..............................
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
