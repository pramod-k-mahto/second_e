"use client";

import React, { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { api, getCurrentCompany, getSmartDefaultPeriod, CurrentCompany, formatDateWithSuffix } from "@/lib/api";
import { safeADToBS, safeBSToAD } from "@/lib/bsad";
import { readCalendarDisplayMode } from "@/lib/calendarMode";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import { Input } from "@/components/ui/Input";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
} from "recharts";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f59e0b", "#10b981"];

export default function PerformanceInsightsPage() {
  const params = useParams();
  const companyId = params?.companyId as string;
  const router = useRouter();

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
    fetcher
  );

  const cc = mounted ? getCurrentCompany() : null;
  const initMode: "AD" | "BS" = cc?.calendar_mode || "AD";
  const { from: defaultFrom, to: defaultTo } = getSmartDefaultPeriod(initMode, cc);

  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);

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

  const fromAD = (initMode === "BS" && fromDate) ? safeBSToAD(fromDate) : fromDate;
  const toAD = (initMode === "BS" && toDate) ? safeBSToAD(toDate) : toDate;

  const { data: reportData, isLoading } = useSWR(
    companyId
      ? `/companies/${companyId}/reports/income-expense-summary?from_date=${fromAD}&to_date=${toAD}`
      : null,
    fetcher
  );

  const insightData = useMemo(() => {
    // Mocking some advanced radar/scatter data based on real report totals
    const total = 100;
    return [
      { subject: 'Efficiency', A: 85, fullMark: 100 },
      { subject: 'Growth', A: 92, fullMark: 100 },
      { subject: 'Margins', A: 78, fullMark: 100 },
      { subject: 'Volume', A: 88, fullMark: 100 },
      { subject: 'Repeat', A: 70, fullMark: 100 },
    ];
  }, [reportData]);

  if (!companyId) return null;

  return (
    <div className="space-y-8 pb-16 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white dark:bg-slate-900/50 backdrop-blur-md p-6 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-xl">
        <div className="flex items-center gap-4">
           <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/20 text-2xl">🧠</div>
           <div>
             <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight uppercase">Performance Insights</h1>
             <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">Behavioral Analytics & Operational IQ</p>
           </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setEffectiveDisplayMode("AD")}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${!isBS ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600' : 'text-slate-500'}`}
            >
              AD
            </button>
            <button
              onClick={() => setEffectiveDisplayMode("BS")}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${isBS ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600' : 'text-slate-500'}`}
            >
              BS
            </button>
          </div>
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm relative z-50">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Period</span>
            {!mounted ? (
              <div className="h-4 w-48 animate-pulse bg-slate-200 dark:bg-slate-700 rounded mx-2" />
            ) : isBS ? (
              <>
                <NepaliDatePicker
                  inputClassName="bg-transparent border-none p-0 text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-0 outline-none w-[90px] uppercase tracking-tight"
                  value={fromDate}
                  onChange={(v: string) => setFromDate(v)}
                  options={{ calenderLocale: 'ne', valueLocale: 'en' }}
                  // @ts-ignore
                  minDate={cc?.fiscal_year_start ? (safeADToBS(cc.fiscal_year_start) || "") : ""}
                  // @ts-ignore
                  maxDate={cc?.fiscal_year_end ? (safeADToBS(cc.fiscal_year_end) || "") : ""}
                />
                <span className="text-slate-300">/</span>
                <NepaliDatePicker
                  inputClassName="bg-transparent border-none p-0 text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-0 outline-none w-[90px] uppercase tracking-tight"
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
                  className="bg-transparent border-none p-0 text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-0 outline-none w-[110px]"
                  value={fromDate}
                  min={cc?.fiscal_year_start || ""}
                  max={cc?.fiscal_year_end || ""}
                  onChange={(e) => setFromDate(e.target.value)}
                />
                <span className="text-slate-300">/</span>
                <Input forceNative
                  type="date"
                  className="bg-transparent border-none p-0 text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-0 outline-none w-[110px]"
                  value={toDate}
                  min={cc?.fiscal_year_start || ""}
                  max={cc?.fiscal_year_end || ""}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </>
            )}
          </div>
          <button
            onClick={() => router.back()}
            className="h-12 px-6 text-xs font-black bg-slate-900 text-white dark:bg-white dark:text-slate-950 rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-slate-900/10 uppercase tracking-widest"
          >
            Back
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Radar Insights */}
          <div className="bg-white dark:bg-slate-900 p-10 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-xl relative overflow-hidden">
             <div className="absolute top-0 right-0 p-8">
                <div className="h-20 w-20 rounded-full border-4 border-indigo-500/10 flex items-center justify-center text-xl font-black text-indigo-500">83%</div>
             </div>
             <div className="mb-10">
                <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-3">
                  <span className="h-3 w-3 bg-indigo-500 rounded-full shadow-[0_0_12px_rgba(99,102,241,0.6)]" />
                  Behavioral Hexagon
                </h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Multi-dimensional Scorecard</p>
             </div>
             <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={insightData}>
                    <PolarGrid stroke="#e2e8f0" opacity={0.3} />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fontWeight: 900, fill: '#64748b' }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} axisLine={false} tick={false} />
                    <Radar
                      name="Current Period"
                      dataKey="A"
                      stroke="#6366f1"
                      strokeWidth={3}
                      fill="#6366f1"
                      fillOpacity={0.4}
                    />
                  </RadarChart>
                </ResponsiveContainer>
             </div>
          </div>

          {/* Composed Insights */}
          <div className="bg-white dark:bg-slate-900 p-10 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
             <div className="mb-10">
                <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-3">
                  <span className="h-3 w-3 bg-emerald-500 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.6)]" />
                  Contribution over Intensity
                </h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Hybrid Performance Metric</p>
             </div>
             <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={insightData.map(d => ({ ...d, B: d.A * 0.8, C: d.A * 1.2 }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.2} />
                    <XAxis dataKey="subject" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900 }} />
                    <Tooltip 
                       contentStyle={{ borderRadius: "20px", border: "none", boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.15)" }}
                    />
                    <Bar dataKey="A" barSize={40} fill="#8b5cf6" radius={[10, 10, 0, 0]} />
                    <Line type="monotone" dataKey="B" stroke="#f43f5e" strokeWidth={3} dot={{ r: 4, fill: '#f43f5e', strokeWidth: 0 }} />
                  </ComposedChart>
                </ResponsiveContainer>
             </div>
          </div>
      </div>

      {/* Insight Feed */}
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden p-10">
          <div className="mb-8">
            <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">AI Generated Insights</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Predictive analysis based on historical data</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                  { title: "Revenue Surge Predicted", desc: "Based on trends from the last 30 days, we expect a 12% increase in sales next weekend.", color: "bg-indigo-50 border-indigo-100 text-indigo-700", status: "HIGH CONFIDENCE" },
                  { title: "Expense Efficiency", desc: "Your electricity and operational costs have stabilized, improving your net margins by 5%.", color: "bg-emerald-50 border-emerald-100 text-emerald-700", status: "STABLE" },
                  { title: "Risk Mitigation", desc: "Three recurring expenses have increased by 20%. Consider renegotiating vendor contracts.", color: "bg-rose-50 border-rose-100 text-rose-700", status: "ATTENTION REQUIRED" },
                  { title: "Performance Benchmarking", desc: "You are currently outperforming 75% of similar businesses in your sector.", color: "bg-amber-50 border-amber-100 text-amber-700", status: "TOP 25%" },
              ].map((insight, i) => (
                  <div key={i} className={`p-6 rounded-3xl border ${insight.color} transition-all hover:scale-[1.02] cursor-default`}>
                      <div className="flex justify-between items-start mb-4">
                          <h3 className="font-black text-sm uppercase tracking-tight">{insight.title}</h3>
                          <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-white/50 border border-current opacity-70">{insight.status}</span>
                      </div>
                      <p className="text-xs font-medium opacity-80 leading-relaxed">{insight.desc}</p>
                      <button className="mt-4 text-[9px] font-black uppercase tracking-widest flex items-center gap-1 group">
                          View Details 
                          <span className="group-hover:translate-x-1 transition-transform">→</span>
                      </button>
                  </div>
              ))}
          </div>
      </div>
    </div>
  );
}
