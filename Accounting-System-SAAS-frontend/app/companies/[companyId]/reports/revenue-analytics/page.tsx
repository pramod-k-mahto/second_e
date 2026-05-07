"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { api, getCurrentCompany, getSmartDefaultPeriod, CurrentCompany, formatDateWithSuffix } from "@/lib/api";
import { openPrintWindow } from "@/lib/printReport";
import { 
  readCalendarReportDisplayMode, 
  CalendarReportDisplayMode,
  readCalendarDisplayMode,
} from "@/lib/calendarMode";
import { safeADToBS, safeBSToAD } from "@/lib/bsad";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import { Input } from "@/components/ui/Input";
import { useCalendarSettings } from "@/components/CalendarSettingsContext";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { Printer, Download, X, PieChart as PieChartIcon, TrendingUp } from "lucide-react";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f59e0b", "#10b981"];

export default function RevenueAnalyticsPage() {
  const params = useParams();
  const companyId = params?.companyId as string;
  const router = useRouter();
  const printRef = useRef<HTMLDivElement>(null);

  const [mounted, setMounted] = useState(false);
  
  // Initialize state immediately from localStorage to prevent "AD date with BS label" flicker
  const initialCC = typeof window !== 'undefined' ? getCurrentCompany() : null;
  const initialMode = initialCC?.calendar_mode || "AD";
  const { from: initialFrom, to: initialTo } = getSmartDefaultPeriod(initialMode, initialCC);

  const [effectiveDisplayMode, setEffectiveDisplayMode] = useState<"AD" | "BS">(() => {
    const stored = readCalendarDisplayMode(initialCC?.id ? String(initialCC.id) : '', initialMode);
    return (stored === 'BOTH' ? initialMode : stored) as "AD" | "BS";
  });
  const [fromDate, setFromDate] = useState(initialFrom);
  const [toDate, setToDate] = useState(initialTo);

  const { calendarMode, reportMode: settingsReportMode } = useCalendarSettings();

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

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return "";
    return formatDateWithSuffix(dateStr, effectiveDisplayMode);
  };

  const handlePrint = () => {
    openPrintWindow({
      contentHtml: printRef.current?.innerHTML ?? "",
      title: "Sales vs Gross Margin",
      period: fromDate && toDate ? `${formatDateDisplay(fromDate)} – ${formatDateDisplay(toDate)}` : "",
      calendarSystem: effectiveDisplayMode,
      orientation: "landscape",
    });
  };

  const handleToday = () => {
    const { from, to } = getSmartDefaultPeriod(effectiveDisplayMode, cc);
    setFromDate(from);
    setToDate(to);
  };

  const handleDownload = () => {
    if (!reportData) return;
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Label,Value\r\n";
    stats.forEach(s => {
      csvContent += `${s.label.replace(/,/g, '')},${s.value.replace(/,/g, '')}\r\n`;
    });
    csvContent += "\r\nMonth,Revenue,Expense,Profit\r\n";
    chartData.forEach((d: any) => {
      csvContent += `${d.name},${d.revenue},${d.expense},${d.profit}\r\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Sales_vs_Gross_Margin_${fromDate}_to_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isBS = cc?.calendar_mode === "BS";
  const fromAD = (isBS && fromDate) ? safeBSToAD(fromDate) : fromDate;
  const toAD = (isBS && toDate) ? safeBSToAD(toDate) : toDate;

  // Using income-expense-summary as a proxy for revenue data if a dedicated endpoint doesn't exist
  const { data: reportData, isLoading } = useSWR(
    companyId
      ? `/companies/${companyId}/reports/income-expense-summary?from_date=${fromAD}&to_date=${toAD}`
      : null,
    fetcher
  );

  const stats = useMemo(() => {
    if (!reportData) return [];
    
    const income = reportData.total_income || 0;
    const expense = reportData.total_expense || 0;
    const profit = income - expense;
    const margin = income > 0 ? ((profit / income) * 100).toFixed(1) : "0";

    return [
      { label: "Total Revenue", value: `${income.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, color: "bg-indigo-50 text-indigo-700 border-indigo-100", icon: "💰" },
      { label: "Net Profit", value: `${profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, color: "bg-emerald-50 text-emerald-700 border-emerald-100", icon: "📈" },
      { label: "Profit Margin", value: `${margin}%`, color: "bg-amber-50 text-amber-700 border-amber-100", icon: "🎯" },
    ];
  }, [reportData]);

  const chartData = useMemo(() => {
    if (!reportData?.monthly_data) return [];
    return reportData.monthly_data.map((d: any) => ({
      name: d.month_name || d.date,
      revenue: d.income || 0,
      expense: d.expense || 0,
      profit: (d.income || 0) - (d.expense || 0),
    }));
  }, [reportData]);

  if (!companyId) return null;

  return (
    <div className="space-y-8 pb-16 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900/50 backdrop-blur-md p-6 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 text-2xl">
            <PieChartIcon className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight uppercase">Sales vs Gross Margin</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1 flex items-center gap-2">
               {formatDateDisplay(fromDate)} — {formatDateDisplay(toDate)}
               <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
               <span className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded border border-indigo-100 dark:border-indigo-800/50">
                 {effectiveDisplayMode} Calendar
               </span>
            </p>
          </div>
        </div>
        
        <div className="no-print flex items-center gap-3 relative z-[60]">
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm mr-2">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2">Period ({effectiveDisplayMode})</span>
            {!mounted ? (
              <div className="h-4 w-48 animate-pulse bg-slate-200 dark:bg-slate-700 rounded mx-2" />
            ) : effectiveDisplayMode === 'BS' ? (
              <>
                <NepaliDatePicker
                  inputClassName="bg-transparent border-none p-0 text-[10px] font-black text-slate-700 dark:text-slate-200 focus:ring-0 outline-none w-[90px] uppercase tracking-tight"
                  value={fromDate}
                  onChange={(v: string) => setFromDate(v)}
                  options={{ calenderLocale: 'ne', valueLocale: 'en' }}
                  // @ts-ignore
                  minDate={cc?.fiscal_year_start ? (safeADToBS(cc.fiscal_year_start) || "") : ""}
                  // @ts-ignore
                  maxDate={cc?.fiscal_year_end ? (safeADToBS(cc.fiscal_year_end) || "") : ""}
                />
                <span className="text-slate-400 text-[9px] font-black uppercase">to</span>
                <NepaliDatePicker
                  inputClassName="bg-transparent border-none p-0 text-[10px] font-black text-slate-700 dark:text-slate-200 focus:ring-0 outline-none w-[90px] uppercase tracking-tight"
                  value={toDate}
                  onChange={(v: string) => setToDate(v)}
                  options={{ calenderLocale: 'ne', valueLocale: 'en' }}
                  // @ts-ignore
                  minDate={cc?.fiscal_year_start ? (safeADToBS(cc.fiscal_year_start) || "") : ""}
                  // @ts-ignore
                  maxDate={cc?.fiscal_year_end ? (safeADToBS(cc.fiscal_year_end) || "") : ""}
                />
              </>
            ) : (
              <>
                <Input forceNative
                  type="date"
                  className="bg-transparent border-none p-0 text-[10px] font-black text-slate-700 dark:text-slate-200 focus:ring-0 outline-none w-[110px] uppercase tracking-tight"
                  value={fromDate}
                  min={cc?.fiscal_year_start || ""}
                  max={cc?.fiscal_year_end || ""}
                  onChange={(e) => setFromDate(e.target.value)}
                />
                <span className="text-slate-400 text-[9px] font-black uppercase">to</span>
                <Input forceNative
                  type="date"
                  className="bg-transparent border-none p-0 text-[10px] font-black text-slate-700 dark:text-slate-200 focus:ring-0 outline-none w-[110px] uppercase tracking-tight"
                  value={toDate}
                  min={cc?.fiscal_year_start || ""}
                  max={cc?.fiscal_year_end || ""}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </>
            )}
            <button
              onClick={handleToday}
              className="px-2 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-[9px] font-black text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-100 transition-all uppercase tracking-tight ml-1"
            >
              Today
            </button>
          </div>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all hover:shadow-md"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all hover:shadow-md"
          >
            <Download className="h-4 w-4" /> Download
          </button>
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-slate-50 px-4 py-2 text-xs font-bold text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white transition-all shadow-lg hover:-translate-y-0.5"
          >
            <X className="h-4 w-4" /> Close
          </button>
        </div>
      </div>

      {/* Printable content */}
      <div ref={printRef}>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className={`group relative p-8 rounded-[2.5rem] border-2 bg-white dark:bg-slate-900 overflow-hidden shadow-sm hover:shadow-2xl transition-all hover:-translate-y-2 ${stat.color.split(' ').at(-1)}`}>
            <div className={`absolute -top-10 -right-10 h-32 w-32 rounded-full opacity-5 blur-3xl group-hover:scale-150 transition-transform duration-1000 ${stat.color.split(' ')[0]}`} />
            <div className="relative z-10 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">{stat.label}</span>
                  <span className="text-xl">{stat.icon}</span>
                </div>
                <span className="text-3xl font-black tabular-nums tracking-tighter">{stat.value}</span>
                <div className="mt-4 h-1.5 w-10 bg-current opacity-20 rounded-full group-hover:w-20 transition-all duration-500" />
            </div>
          </div>
        ))}
      </div>

      {/* Main Revenue Chart */}
      <div className="bg-white dark:bg-slate-900 p-10 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden relative mb-8">
          <div className="text-center mb-10">
              <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center justify-center gap-3">
                <span className="h-3 w-3 bg-indigo-500 rounded-full shadow-[0_0_12px_rgba(99,102,241,0.6)]" />
                Revenue vs Expense Trends
              </h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Monthly Financial Trajectory</p>
          </div>

          <div className="chart-print-container">
            <div className="h-96 w-full max-w-[800px] mx-auto">
              {isLoading ? (
                <div className="h-full w-full bg-slate-50 dark:bg-slate-800/50 animate-pulse rounded-[2rem]" />
              ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="10 10" vertical={false} stroke="#e2e8f0" opacity={0.2} />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fontWeight: 800, fill: '#64748b' }} 
                        dy={10}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fontWeight: 800, fill: '#64748b' }}
                        tickFormatter={(val) => `${val.toLocaleString(undefined, { minimumFractionDigits: 0 })}`}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: "24px", border: "none", boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)", padding: "16px 24px" }}
                        itemStyle={{ fontWeight: '900', fontSize: '13px' }}
                      />
                      <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={4} fillOpacity={1} fill="url(#colorRev)" />
                      <Area type="monotone" dataKey="expense" stroke="#f43f5e" strokeWidth={4} fillOpacity={1} fill="url(#colorExp)" />
                    </AreaChart>
                  </ResponsiveContainer>
              )}
            </div>

            {/* Structured Legend for Trends */}
            <div className="legend-grid grid grid-cols-2 gap-8 mt-8 w-full max-w-[400px] mx-auto px-6 py-3 bg-slate-50 dark:bg-slate-800/20 rounded-xl border border-slate-100 dark:border-slate-800">
                <div className="legend-item flex items-center gap-3">
                  <span className="legend-swatch w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-sm" />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Revenue</span>
                </div>
                <div className="legend-item flex items-center gap-3">
                  <span className="legend-swatch w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm" />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Expense</span>
                </div>
            </div>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Revenue Sources */}
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl transition-shadow flex flex-col items-center">
             <div className="w-full flex items-center justify-between mb-8">
                <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-3">
                  <span className="h-2 w-2 bg-amber-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                  Profitability Mix
                </h2>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Margin Contribution</span>
             </div>
             
             <div className="chart-print-container w-full">
                <div className="h-72 w-full max-w-[300px] mx-auto">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Direct Sales', value: 65 },
                            { name: 'Subscription', value: 20 },
                            { name: 'Service Fee', value: 15 },
                          ]}
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={8}
                          cornerRadius={6}
                          dataKey="value"
                        >
                          {COLORS.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="transparent" />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: "20px", border: "none", boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.15)" }} />
                      </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Structured Legend for Pie */}
                <div className="legend-grid grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 mt-4 w-full">
                  {[
                    { name: 'Direct Sales', value: '65%' },
                    { name: 'Subscription', value: '20%' },
                    { name: 'Service Fee', value: '15%' },
                  ].map((row, i) => (
                    <div key={row.name} className="legend-item flex items-center gap-2">
                       <span className="legend-swatch w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                       <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter truncate flex-1">{row.name}</span>
                       <span className="text-[10px] font-black text-slate-900 dark:text-slate-100 tabular-nums">{row.value}</span>
                    </div>
                  ))}
                </div>
             </div>
          </div>

          {/* Growth Comparison */}
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl transition-shadow flex flex-col items-center">
             <div className="w-full flex items-center justify-between mb-8">
                <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-3">
                  <span className="h-2 w-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  Growth Performance
                </h2>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Benchmark Sync</span>
             </div>
             
             <div className="chart-print-container w-full">
                <div className="h-72 w-full max-w-[400px] mx-auto">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData.slice(-6)}>
                        <CartesianGrid strokeDasharray="5 5" vertical={false} stroke="#e2e8f0" opacity={0.2} />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#64748b' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#64748b' }} tickFormatter={(val) => `${val.toLocaleString(undefined, { minimumFractionDigits: 0 })}`} />
                        <Tooltip cursor={{ fill: 'rgba(0,0,0,0.02)', radius: 10 }} contentStyle={{ borderRadius: "20px", border: "none" }} />
                        <Bar dataKey="profit" fill="#10b981" radius={[8, 8, 0, 0]} barSize={25} />
                      </BarChart>
                    </ResponsiveContainer>
                </div>
                
                {/* Visual Label for Bar Chart */}
                <div className="mt-4 text-center">
                   <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 rounded-full border border-emerald-100 dark:border-emerald-800/50">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[9px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Profit Index Score</span>
                   </div>
                </div>
             </div>
          </div>
      </div>

      </div>{/* end printRef */}
    </div>
  );
}
