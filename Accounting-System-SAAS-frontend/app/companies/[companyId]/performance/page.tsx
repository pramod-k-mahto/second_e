"use client";

import { useParams } from "next/navigation";
import { useAllPerformance } from "@/lib/performance/queries";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Trophy, CheckCircle2, TrendingUp, DollarSign } from "lucide-react";

export default function PerformanceDashboard() {
  const params = useParams();
  const companyId = params.companyId as string;
  const { data: performance, isLoading } = useAllPerformance(companyId);

  if (isLoading) {
    return <div className="p-8 text-slate-100">Loading performance data...</div>;
  }

  const overallStats = {
    totalTasks: performance?.reduce((acc, curr) => acc + curr.total_tasks, 0) || 0,
    completedTasks: performance?.reduce((acc, curr) => acc + curr.completed_tasks, 0) || 0,
    totalRevenue: performance?.reduce((acc, curr) => acc + curr.total_revenue, 0) || 0,
    totalRewards: performance?.reduce((acc, curr) => acc + curr.total_rewards_amount, 0) || 0,
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader 
        title="Performance Dashboard" 
        subtitle="Track employee productivity, revenue generation and reward distribution across the organization."
        closeLink={`/companies/${companyId}`}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium opacity-70">Total Tasks</span>
            <CheckCircle2 className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold">{overallStats.totalTasks}</div>
            <p className="text-xs text-indigo-400 mt-1">{overallStats.completedTasks} Completed</p>
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium opacity-70">Avg Completion Rate</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold">
            {overallStats.totalTasks > 0 
              ? ((overallStats.completedTasks / overallStats.totalTasks) * 100).toFixed(1) 
              : 0}%
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full mt-2 overflow-hidden">
            <div 
              className="bg-emerald-500 h-2 rounded-full" 
              style={{ width: `${overallStats.totalTasks > 0 ? (overallStats.completedTasks / overallStats.totalTasks) * 100 : 0}%` }}
            />
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium opacity-70">Total Revenue</span>
            <DollarSign className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold">Rs. {overallStats.totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-amber-400 mt-1">Direct Sales Attribution</p>
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium opacity-70">Rewards Issued</span>
            <Trophy className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold">Rs. {overallStats.totalRewards.toLocaleString()}</div>
            <p className="text-xs text-purple-400 mt-1">Incentives Given</p>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-slate-100">Employee Performance Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wider">
                <th className="py-3 px-2 font-medium opacity-70">Employee</th>
                <th className="py-3 px-2 font-medium opacity-70">Tasks (Done/Total)</th>
                <th className="py-3 px-2 font-medium opacity-70">Completion %</th>
                <th className="py-3 px-2 font-medium opacity-70">Revenue</th>
                <th className="py-3 px-2 font-medium opacity-70">Points</th>
                <th className="py-3 px-2 font-medium opacity-70">Total Rewards</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {performance?.map((emp) => (
                <tr key={emp.employee_id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="py-4 px-2 font-medium text-slate-100">{emp.full_name}</td>
                  <td className="py-4 px-2 text-slate-300">
                    {emp.completed_tasks} / {emp.total_tasks}
                  </td>
                  <td className="py-4 px-2">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-emerald-500 h-1.5 rounded-full" 
                          style={{ width: `${emp.completion_rate}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400">{emp.completion_rate.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="py-4 px-2 font-mono text-amber-400">Rs. {emp.total_revenue.toLocaleString()}</td>
                  <td className="py-4 px-2">
                    <span className="bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded text-xs font-bold ring-1 ring-indigo-500/30">
                      {emp.total_points} pts
                    </span>
                  </td>
                  <td className="py-4 px-2 text-purple-400 font-medium">Rs. {emp.total_rewards_amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {performance?.length === 0 && (
            <div className="py-12 text-center text-slate-500 italic">No employee performance data available.</div>
          )}
        </div>
      </Card>
    </div>
  );
}
