"use client";

import React, { useState, useMemo } from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
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
  Cell,
} from "recharts";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f59e0b", "#10b981"];

export default function RestaurantSummaryPage() {
  const params = useParams();
  const companyId = params?.companyId as string;
  const router = useRouter();

  const [fromDate, setFromDate] = useState<string>(
    new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split("T")[0]
  );
  const [toDate, setToDate] = useState<string>(new Date().toISOString().split("T")[0]);

  const { data: reportData, isLoading } = useSWR(
    companyId
      ? `/companies/${companyId}/reports/restaurant-summary?from_date=${fromDate}&to_date=${toDate}`
      : null,
    fetcher
  );

  const stats = useMemo(() => {
    if (!reportData || typeof reportData !== 'object' || Array.isArray(reportData)) return [];
    
    return [
      { label: "Total Sales", value: `NPR ${(reportData.total_sales || 0).toLocaleString()}`, color: "bg-indigo-50 text-indigo-700 border-indigo-100" },
      { label: "Total Orders", value: reportData.total_orders || 0, color: "bg-emerald-50 text-emerald-700 border-emerald-100" },
      { label: "Avg. Order Value", value: `NPR ${( (reportData.total_sales || 0) / (reportData.total_orders || 1) ).toFixed(2)}`, color: "bg-amber-50 text-amber-700 border-amber-100" },
    ];
  }, [reportData]);

  if (!companyId) return null;

  return (
    <div className="space-y-8 pb-16 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white dark:bg-slate-900/50 backdrop-blur-md p-6 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl">
        <div className="flex items-center gap-4">
           <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 text-2xl">📊</div>
           <div>
             <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight uppercase">Restaurant Analytics</h1>
             <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">Performance Insight & Revenue Tracking</p>
           </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-inner">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-transparent border-none text-[10px] font-black text-slate-700 dark:text-slate-200 focus:ring-0 outline-none p-1 uppercase tracking-tight"
            />
            <span className="text-slate-400 text-[9px] font-black uppercase">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-transparent border-none text-[10px] font-black text-slate-700 dark:text-slate-200 focus:ring-0 outline-none p-1 uppercase tracking-tight"
            />
          </div>
          <button
            onClick={() => router.back()}
            className="h-12 px-6 text-xs font-black bg-slate-900 text-white dark:bg-white dark:text-slate-950 rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-slate-900/10 uppercase tracking-widest"
          >
            Back
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className={`group relative p-8 rounded-[2.5rem] border-2 bg-white dark:bg-slate-900 overflow-hidden shadow-sm hover:shadow-2xl transition-all hover:-translate-y-2 ${stat.color.split(' ').at(-1)}`}>
            <div className={`absolute -top-10 -right-10 h-32 w-32 rounded-full opacity-5 blur-3xl group-hover:scale-150 transition-transform duration-1000 ${stat.color.split(' ')[0]}`} />
            <div className="relative z-10 flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 mb-3">{stat.label}</span>
                <span className="text-3xl font-black tabular-nums tracking-tighter">{stat.value}</span>
                <div className="mt-4 h-1.5 w-10 bg-current opacity-20 rounded-full group-hover:w-20 transition-all duration-500" />
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Sales by Order Type */}
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-3">
              <span className="h-2 w-2 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
              Sales Distribution
            </h2>
            <span className="text-[10px] font-bold text-slate-400 uppercase">By Order Type</span>
          </div>
          <div className="h-72">
            {isLoading ? (
               <div className="h-full w-full bg-slate-50 dark:bg-slate-800/50 animate-pulse rounded-[2rem]" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={reportData?.summary_by_type || []}
                    dataKey="total_amount"
                    nameKey="order_type"
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={95}
                    paddingAngle={8}
                    cornerRadius={8}
                    label={false}
                  >
                    {reportData?.summary_by_type.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip 
                     contentStyle={{ borderRadius: "20px", border: "none", boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.15)", padding: "12px 20px" }}
                     itemStyle={{ fontWeight: '900', fontSize: '12px' }}
                  />
                  <Legend iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Top Tables Performance */}
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-3">
              <span className="h-2 w-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              Table Efficiency
            </h2>
            <span className="text-[10px] font-bold text-slate-400 uppercase">Top 10 Ranked</span>
          </div>
          <div className="h-72">
             {isLoading ? (
               <div className="h-full w-full bg-slate-50 dark:bg-slate-800/50 animate-pulse rounded-[2rem]" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reportData?.summary_by_table.slice(0, 10) || []} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="8 8" vertical={false} stroke="#e2e8f0" opacity={0.3} />
                  <XAxis dataKey="table_number" fontSize={10} fontWeight="900" axisLine={false} tickLine={false} tickFormatter={(val) => `T${val}`} />
                  <YAxis fontSize={10} fontWeight="900" axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{ fill: "rgba(0,0,0,0.02)", radius: 12 }}
                    contentStyle={{ borderRadius: "20px", border: "none", boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.15)", padding: "12px 20px" }}
                  />
                  <Bar dataKey="total_amount" fill="url(#barGradient)" radius={[10, 10, 0, 0]} barSize={35}>
                      <defs>
                          <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10b981" />
                              <stop offset="100%" stopColor="#059669" />
                          </linearGradient>
                      </defs>
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Table */}
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="px-10 py-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
                <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Transactional Summary</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Breakdown by Segment and Entity</p>
            </div>
            <button className="h-10 px-4 rounded-xl bg-slate-50 dark:bg-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors border border-slate-100 dark:border-slate-700">Export CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800">
                <th className="px-6 py-3">Category</th>
                <th className="px-6 py-3">Reference</th>
                <th className="px-6 py-3 text-right">Orders</th>
                <th className="px-6 py-3 text-right">Items Sold</th>
                <th className="px-6 py-3 text-right">Total Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {reportData?.summary_by_type.map((row: any, i: number) => (
                <tr key={`type-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-3 font-semibold text-indigo-600 dark:text-indigo-400 uppercase">Order Type</td>
                  <td className="px-6 py-3 font-bold">{row.order_type}</td>
                  <td className="px-6 py-3 text-right">{row.invoice_count}</td>
                  <td className="px-6 py-3 text-right">{row.total_items}</td>
                  <td className="px-6 py-3 text-right font-black">NPR {row.total_amount.toLocaleString()}</td>
                </tr>
              ))}
              {reportData?.summary_by_table.map((row: any, i: number) => (
                <tr key={`table-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-3 text-slate-500 dark:text-slate-400">Dine-in Table</td>
                  <td className="px-6 py-3">Table {row.table_number}</td>
                  <td className="px-6 py-3 text-right">{row.invoice_count}</td>
                  <td className="px-6 py-3 text-right">{row.total_items}</td>
                  <td className="px-6 py-3 text-right">NPR {row.total_amount.toLocaleString()}</td>
                </tr>
              ))}
              {!isLoading && (!reportData || (reportData.summary_by_type.length === 0 && reportData.summary_by_table.length === 0)) && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                    No data found for the selected period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
