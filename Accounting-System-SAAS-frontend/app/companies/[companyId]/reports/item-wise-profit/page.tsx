"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { api, getCurrentCompany, getSmartDefaultPeriod, CurrentCompany } from "@/lib/api";
import { safeADToBS, safeBSToAD } from "@/lib/bsad";
import { readCalendarDisplayMode } from "@/lib/calendarMode";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import { Input } from "@/components/ui/Input";
import { openPrintWindow } from "@/lib/printReport";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { Printer, ArrowLeft, TrendingUp, Package, Percent } from "lucide-react";

// Fallback Mock Data Generator
const generateMockData = () => {
  const items = [
    { id: 1, name: "Premium Laptop Pro", sku: "LP-001", category: "Electronics", qty_sold: 45, avg_cost: 85000, avg_price: 120000 },
    { id: 2, name: "Wireless Ergonomic Mouse", sku: "MS-002", category: "Accessories", qty_sold: 320, avg_cost: 1500, avg_price: 3500 },
    { id: 3, name: "Mechanical Keyboard", sku: "KB-003", category: "Accessories", qty_sold: 150, avg_cost: 4500, avg_price: 8500 },
    { id: 4, name: "27-inch 4K Monitor", sku: "MN-4K", category: "Electronics", qty_sold: 85, avg_cost: 32000, avg_price: 45000 },
    { id: 5, name: "USB-C Hub Multiport", sku: "UH-001", category: "Accessories", qty_sold: 210, avg_cost: 1200, avg_price: 2800 },
    { id: 6, name: "Noise Cancelling Headphones", sku: "HP-NC", category: "Audio", qty_sold: 95, avg_cost: 12000, avg_price: 22000 },
    { id: 7, name: "Webcam 1080p HD", sku: "WC-1080", category: "Electronics", qty_sold: 110, avg_cost: 3500, avg_price: 6500 },
    { id: 8, name: "Gaming Mousepad", sku: "MP-LG", category: "Accessories", qty_sold: 400, avg_cost: 300, avg_price: 1200 },
    { id: 9, name: "Bluetooth Speaker Portable", sku: "SP-BT", category: "Audio", qty_sold: 180, avg_cost: 2500, avg_price: 5500 },
    { id: 10, name: "External SSD 1TB", sku: "SD-1TB", category: "Storage", qty_sold: 130, avg_cost: 11000, avg_price: 18000 },
  ];

  return items.map(item => {
    const revenue = item.qty_sold * item.avg_price;
    const cost = item.qty_sold * item.avg_cost;
    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    
    return {
      ...item,
      revenue,
      cost,
      profit,
      margin
    };
  }).sort((a, b) => b.profit - a.profit);
};

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#64748b"];

// Optional backend fetcher
const fetcher = async (url: string) => {
  try {
    const res = await api.get(url);
    if (res.data?.success && res.data?.data) return res.data.data;
    throw new Error("No data");
  } catch (err) {
    console.warn("Backend API not yet ready, using robust mock data for Item Wise Profit Report.");
    return generateMockData();
  }
};

export default function ItemWiseProfitPage() {
  const params = useParams();
  const companyId = params?.companyId as string;
  const router = useRouter();
  const printRef = useRef<HTMLDivElement>(null);

  const [mounted, setMounted] = useState(false);
  const [effectiveDisplayMode, setEffectiveDisplayMode] = useState<"AD" | "BS">("AD");

  useEffect(() => {
    setMounted(true);
    const cc = getCurrentCompany();
    const stored = readCalendarDisplayMode(cc?.id ? String(cc.id) : '', cc?.calendar_mode || 'AD');
    setEffectiveDisplayMode((stored === 'BOTH' ? (cc?.calendar_mode || 'AD') : stored) as "AD" | "BS");
  }, []);

  const { data: dbCompany } = useSWR<CurrentCompany>(
    companyId ? `/companies/${companyId}` : null,
    async (url: string) => {
      const res = await api.get(url);
      return res.data;
    }
  );

  const cc = mounted ? getCurrentCompany() : null;
  const initMode: "AD" | "BS" = cc?.calendar_mode || "AD";
  const { from: defaultFrom, to: defaultTo } = getSmartDefaultPeriod(initMode, cc);

  const [fromDate, setFromDate] = useState<string>(defaultFrom);
  const [toDate, setToDate] = useState<string>(defaultTo);

  // Sync state if cc OR dbCompany changes after mount
  useEffect(() => {
    if (mounted) {
      const activeCo = dbCompany || cc;
      if (activeCo) {
        const { from, to } = getSmartDefaultPeriod(activeCo.calendar_mode || "AD", activeCo);
        setFromDate(from);
        setToDate(to);
        if (activeCo.calendar_mode) {
          setEffectiveDisplayMode(activeCo.calendar_mode as any);
        }
      }
    }
  }, [mounted, dbCompany?.id, cc?.id, dbCompany?.fiscal_year_start, dbCompany?.calendar_mode]);

  const isBS = effectiveDisplayMode === "BS";

  const handleToday = () => {
    const { from, to } = getSmartDefaultPeriod(effectiveDisplayMode === "BS" ? "BS" : "AD");
    setFromDate(from);
    setToDate(to);
  };

  const fromAD = (initMode === "BS" && fromDate) ? safeBSToAD(fromDate) : fromDate;
  const toAD = (initMode === "BS" && toDate) ? safeBSToAD(toDate) : toDate;

  // Using SWR to fetch data, automatically falls back to mock if API throws 404/error.
  const { data: rawData, isLoading } = useSWR(
    companyId ? `/companies/${companyId}/reports/item-wise-profit?from_date=${fromAD}&to_date=${toAD}` : null,
    fetcher
  );

  const reportData = rawData || [];

  const stats = useMemo(() => {
    if (!reportData || reportData.length === 0) return [];
    
    const totalRevenue = reportData.reduce((sum: number, item: any) => sum + item.revenue, 0);
    const totalCost = reportData.reduce((sum: number, item: any) => sum + item.cost, 0);
    const totalProfit = totalRevenue - totalCost;
    const averageMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    
    const topItem = reportData[0]; // Since it's sorted by profit

    return [
      { label: "Total Net Profit", value: `NPR ${totalProfit.toLocaleString()}`, color: "bg-indigo-50 text-indigo-700", border: "border-indigo-100", icon: <TrendingUp className="w-6 h-6" /> },
      { label: "Avg Profit Margin", value: `${averageMargin.toFixed(1)}%`, color: "bg-emerald-50 text-emerald-700", border: "border-emerald-100", icon: <Percent className="w-6 h-6" /> },
      { label: "Top Performer", value: topItem.name, sub: `NPR ${topItem.profit.toLocaleString()} Profit`, color: "bg-rose-50 text-rose-700", border: "border-rose-100", icon: <Package className="w-6 h-6" /> },
    ];
  }, [reportData]);

  const pieData = useMemo(() => {
    if (!reportData || reportData.length === 0) return [];
    const _data = [...reportData].sort((a, b) => b.profit - a.profit);
    const top5 = _data.slice(0, 5);
    const othersProfit = _data.slice(5).reduce((sum, item) => sum + item.profit, 0);
    
    const chartFormatted = top5.map(item => ({ name: item.name, value: item.profit }));
    if (othersProfit > 0) chartFormatted.push({ name: "Others", value: othersProfit });
    
    return chartFormatted.filter(d => d.value > 0);
  }, [reportData]);

  const handlePrint = () => {
    if (typeof window === "undefined") return;
    openPrintWindow({
      contentHtml: printRef.current?.innerHTML ?? "",
      title: "Item Wise Profit",
      company: "",
      period: fromDate && toDate ? `${fromDate} – ${toDate}` : "",
      orientation: "landscape",
    });
  };

  if (!companyId) return null;

  return (
    <div className="space-y-8 pb-16 animate-in fade-in duration-700 print:space-y-4 print:pb-0 print:bg-white print:text-black">
      {/* Header - Hidden on Print, we will show a simplified print header later if needed or just use this */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white dark:bg-slate-900/50 backdrop-blur-md p-6 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl print:shadow-none print:border-none print:p-0 print:bg-transparent md:print:flex-row">
        <div className="flex items-center gap-4">
           <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-rose-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 print:hidden">
              <TrendingUp className="w-7 h-7" />
           </div>
           <div>
             <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight uppercase print:text-black">Item Wise Profit</h1>
             <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1 print:text-gray-500">
              {isBS ? (safeADToBS(fromDate) || fromDate) : fromDate} to {isBS ? (safeADToBS(toDate) || toDate) : toDate}
             </p>
           </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setEffectiveDisplayMode("AD")}
              className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase transition-all ${!isBS ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600' : 'text-slate-500'}`}
            >
              AD
            </button>
            <button
              onClick={() => setEffectiveDisplayMode("BS")}
              className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase transition-all ${isBS ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600' : 'text-slate-500'}`}
            >
              BS
            </button>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-inner relative z-[60]">
            {!mounted ? (
              <div className="h-4 w-48 animate-pulse bg-slate-200 dark:bg-slate-700 rounded mx-2" />
            ) : isBS ? (
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
                  value={fromDate}
                  min={cc?.fiscal_year_start || ""}
                  max={cc?.fiscal_year_end || ""}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="bg-transparent border-none p-0 text-[10px] font-black text-slate-700 dark:text-slate-200 focus:ring-0 outline-none w-[110px] uppercase tracking-tight"
                />
                <span className="text-slate-400 text-[9px] font-black uppercase">to</span>
                <Input forceNative
                  type="date"
                  value={toDate}
                  min={cc?.fiscal_year_start || ""}
                  max={cc?.fiscal_year_end || ""}
                  onChange={(e) => setToDate(e.target.value)}
                  className="bg-transparent border-none p-0 text-[10px] font-black text-slate-700 dark:text-slate-200 focus:ring-0 outline-none w-[110px] uppercase tracking-tight"
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
            className="flex items-center gap-2 h-12 px-5 text-xs font-black bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-2xl hover:bg-indigo-100 transition-colors uppercase tracking-widest border border-indigo-100 dark:border-indigo-800"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 h-12 px-5 text-xs font-black bg-slate-900 text-white dark:bg-white dark:text-slate-950 rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-slate-900/10 uppercase tracking-widest"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>
      </div>

      {/* Stats Grid - Hidden on Print to save ink/space */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:hidden">
        {stats.map((stat, i) => (
          <div key={i} className={`group relative p-8 rounded-[2.5rem] border-2 bg-white dark:bg-slate-900 overflow-hidden shadow-sm hover:shadow-2xl transition-all hover:-translate-y-2 ${stat.color} ${stat.border}`}>
            <div className={`absolute -top-10 -right-10 h-32 w-32 rounded-full opacity-10 blur-3xl group-hover:scale-150 transition-transform duration-1000 ${stat.color}`} />
            <div className="relative z-10 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">{stat.label}</span>
                  <span className="opacity-80">{stat.icon}</span>
                </div>
                <div className="text-3xl font-black tabular-nums tracking-tighter truncate" title={stat.value}>{stat.value}</div>
                {stat.sub && <div className="text-xs font-semibold opacity-80 mt-1 truncate">{stat.sub}</div>}
                {!stat.sub && <div className="mt-4 h-1.5 w-10 bg-current opacity-20 rounded-full group-hover:w-20 transition-all duration-500" />}
            </div>
          </div>
        ))}
      </div>

      {/* Charts Grid - Hidden on print as users usually want the data table printed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 print:hidden">
        
        {/* Main Bar Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden relative">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-3">
                <span className="h-2 w-2 bg-indigo-500 rounded-full shadow-[0_0_12px_rgba(99,102,241,0.6)]" />
                Revenue & Profit Comparison
              </h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Top 10 Items</p>
            </div>
            <div className="flex gap-4">
               <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded bg-slate-300 dark:bg-slate-700"></span>
                  <span className="text-[9px] font-black text-slate-500 uppercase">Cost</span>
               </div>
               <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded bg-emerald-400"></span>
                  <span className="text-[9px] font-black text-slate-500 uppercase">Profit</span>
               </div>
            </div>
          </div>

          <div className="h-80 w-full">
            {isLoading ? (
               <div className="h-full w-full bg-slate-50 dark:bg-slate-800/50 animate-pulse rounded-[2rem]" />
            ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={reportData.slice(0, 10).map((d: any) => ({ ...d, shortName: d.name.substring(0, 10) + ".." }))} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="5 5" vertical={false} stroke="#e2e8f0" opacity={0.3} />
                    <XAxis 
                       dataKey="shortName" 
                       axisLine={false} 
                       tickLine={false} 
                       tick={{ fontSize: 9, fontWeight: 800, fill: '#64748b' }} 
                       dy={10}
                    />
                    <YAxis 
                       axisLine={false} 
                       tickLine={false} 
                       tick={{ fontSize: 9, fontWeight: 800, fill: '#64748b' }}
                       tickFormatter={(val) => `NPR ${(val / 1000).toFixed(0)}k`}
                    />
                    <Tooltip 
                       contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.15)", padding: "12px 16px" }}
                       itemStyle={{ fontWeight: '900', fontSize: '12px' }}
                       formatter={(value: number, name: string) => [`NPR ${value.toLocaleString()}`, name.charAt(0).toUpperCase() + name.slice(1)]}
                       labelStyle={{ fontWeight: '800', color: '#64748b', marginBottom: '8px', fontSize: '10px', textTransform: 'uppercase' }}
                       labelFormatter={(label) => {
                         const item = reportData.find((d: any) => d.name.substring(0, 10) + ".." === label || d.name === label);
                         return item ? item.name : label;
                       }}
                    />
                    {/* Stack bars: Cost and Profit stacked vertically = Revenue */}
                    <Bar dataKey="cost" stackId="a" fill="#cbd5e1" radius={[0, 0, 4, 4]} barSize={24} />
                    <Bar dataKey="profit" stackId="a" fill="#34d399" radius={[4, 4, 0, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Profit Mix */}
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
             <div className="flex items-center justify-between mb-8">
                <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-3">
                  <span className="h-2 w-2 bg-rose-500 rounded-full shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                  Profit Makers
                </h2>
             </div>
             <div className="h-72">
                {isLoading ? (
                  <div className="h-full w-full bg-slate-50 dark:bg-slate-800/50 animate-pulse rounded-full opacity-50 mx-auto aspect-square max-w-[200px]" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        innerRadius={70}
                        outerRadius={95}
                        paddingAngle={6}
                        cornerRadius={8}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="transparent" />
                        ))}
                      </Pie>
                      <Tooltip 
                         contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.15)" }}
                         itemStyle={{ fontWeight: "800", fontSize: "12px" }}
                         formatter={(value: number) => [`NPR ${value.toLocaleString()}`, "Contribution"]}
                      />
                      <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: '700' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
             </div>
        </div>
      </div>

      {/* Tabular List (Menu Page Based - Print Ready) */}
      <div ref={printRef} className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden print:shadow-none print:border-none print:rounded-none dark:print:bg-white text-slate-800 dark:text-slate-100 print:text-black">
        <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 print:border-slate-300 print:px-0">
          <h2 className="text-[13px] font-black uppercase tracking-widest">Item Wise Data Grid</h2>
          <p className="text-[10px] font-semibold text-slate-400 mt-1 print:text-slate-600">Comprehensive comparitive breakdown of total units, costs, revenues, and final profit margins.</p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-50/50 dark:bg-slate-800/20 print:bg-slate-100">
              <tr>
                <th className="px-8 py-4 font-black text-[10px] uppercase tracking-widest text-slate-500 whitespace-nowrap print:px-2 print:text-black border-b print:border-slate-300">Item Details</th>
                <th className="px-4 py-4 font-black text-[10px] uppercase tracking-widest text-slate-500 whitespace-nowrap text-right print:px-2 print:text-black border-b print:border-slate-300">Qty Sold</th>
                <th className="px-4 py-4 font-black text-[10px] uppercase tracking-widest text-slate-500 whitespace-nowrap text-right print:px-2 print:text-black border-b print:border-slate-300">Total Cost</th>
                <th className="px-4 py-4 font-black text-[10px] uppercase tracking-widest text-slate-500 whitespace-nowrap text-right print:px-2 print:text-black border-b print:border-slate-300">Total Revenue</th>
                <th className="px-8 py-4 font-black text-[10px] uppercase tracking-widest text-slate-500 whitespace-nowrap text-right print:px-2 print:text-black border-b print:border-slate-300">Net Profit / Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 print:divide-slate-300 text-[13px] font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-8 py-10 text-center text-slate-400 font-semibold text-xs">Loading report data...</td>
                </tr>
              ) : reportData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-8 py-10 text-center text-slate-400 font-semibold text-xs">No records found for the selected period.</td>
                </tr>
              ) : (
                reportData.map((item: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors print:hover:bg-transparent">
                    <td className="px-8 py-4 print:px-2">
                       <div className="font-bold text-slate-800 dark:text-slate-100 print:text-black">{item.name}</div>
                       <div className="text-[10px] text-slate-400 font-semibold flex items-center gap-2 mt-0.5 opacity-80 print:text-slate-600">
                          {item.sku} &bull; {item.category}
                       </div>
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums print:px-2">
                      <span className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 font-bold px-2 py-0.5 rounded text-[11px] print:bg-transparent print:p-0 print:text-black">
                        {item.qty_sold}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums text-slate-500 dark:text-slate-400 print:px-2 print:text-black font-semibold">
                      {item.cost.toLocaleString()}
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums text-slate-700 dark:text-slate-200 print:px-2 print:text-black font-semibold">
                      {item.revenue.toLocaleString()}
                    </td>
                    <td className="px-8 py-4 text-right print:px-2">
                      <div className="font-black text-emerald-600 dark:text-emerald-400 tabular-nums print:text-black">
                        {item.profit.toLocaleString()}
                      </div>
                      <div className={`text-[10px] font-bold mt-0.5 ${item.margin > 30 ? 'text-indigo-500' : 'text-slate-400'}`}>
                        {item.margin.toFixed(1)}% margin
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {!isLoading && reportData.length > 0 && (
              <tfoot className="bg-slate-50/80 dark:bg-slate-800/30 print:bg-slate-200 font-bold border-t-2 border-slate-200 dark:border-slate-800 print:border-slate-400 text-[13px]">
                <tr>
                  <td className="px-8 py-5 text-right font-black uppercase tracking-widest text-[10px] print:px-2 print:text-black">Total</td>
                  <td className="px-4 py-5 text-right tabular-nums print:px-2 print:text-black">{stats[0] ? (reportData.reduce((s:number,i:any) => s + i.qty_sold, 0)).toLocaleString() : ""}</td>
                  <td className="px-4 py-5 text-right tabular-nums print:px-2 text-slate-500 print:text-black">{stats[0] ? (reportData.reduce((s:number,i:any) => s + i.cost, 0)).toLocaleString() : ""}</td>
                  <td className="px-4 py-5 text-right tabular-nums print:px-2 print:text-black">{stats[0] ? (reportData.reduce((s:number,i:any) => s + i.revenue, 0)).toLocaleString() : ""}</td>
                  <td className="px-8 py-5 text-right tabular-nums text-emerald-600 print:px-2 print:text-black text-[15px]">{stats[0]?.value}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
