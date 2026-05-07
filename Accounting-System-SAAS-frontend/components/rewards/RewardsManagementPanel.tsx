"use client";

import { useState } from "react";
import { useRewards, useGrantReward, useRevokeReward } from "@/lib/rewards/queries";
import { PayrollApi } from "@/lib/payroll/api";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Trophy, Plus, Trash2, Coins, Gift, Award, X } from "lucide-react";
import { RewardType, RewardCreate } from "@/lib/rewards/types";

export function RewardsManagementPanel({
  companyId,
  embedded = false,
}: {
  companyId: string;
  embedded?: boolean;
}) {
  const { data: rewards, isLoading: rewardsLoading } = useRewards(companyId);
  const { data: employees, isLoading: employeesLoading } = useQuery({
    queryKey: ['employees', companyId],
    queryFn: () => PayrollApi.listEmployees(parseInt(companyId)),
    enabled: !!companyId,
  });

  const grantMutation = useGrantReward(companyId);
  const revokeMutation = useRevokeReward(companyId);

  const [formData, setFormData] = useState<RewardCreate>({
    employee_id: 0,
    reward_type: "POINTS",
    amount: 0,
    points: 0,
    reason: "",
  });

  const [showForm, setShowForm] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.employee_id === 0) return alert("Select an employee");
    try {
      await grantMutation.mutateAsync(formData);
      setShowForm(false);
      setFormData({
        employee_id: 0,
        reward_type: "POINTS",
        amount: 0,
        points: 0,
        reason: "",
      });
    } catch (err) {
      alert("Failed to grant reward");
    }
  };

  const handleRevoke = async (id: number) => {
    if (confirm("Are you sure you want to revoke this reward?")) {
      await revokeMutation.mutateAsync(id);
    }
  };

  if (rewardsLoading || employeesLoading) {
    return (
      <div
        className={
          embedded
            ? "p-8 text-sm text-slate-500 dark:text-slate-400"
            : "p-8 text-slate-100"
        }
      >
        Loading rewards management...
      </div>
    );
  }

  return (
    <div className={embedded ? "space-y-4" : "p-6 space-y-6"}>
      <PageHeader 
        title="Rewards Management" 
        subtitle="Incentivize your team with points, monetary bonuses or achievement badges based on their performance."
        closeLink={embedded ? undefined : `/companies/${companyId}`}
        actions={
          <Button 
            onClick={() => setShowForm(!showForm)}
            className={showForm ? "bg-slate-700 hover:bg-slate-600" : "bg-indigo-600 hover:bg-indigo-700"}
          >
            {showForm ? <><X className="w-4 h-4 mr-2" /> Cancel</> : <><Plus className="w-4 h-4 mr-2" /> Grant Reward</>}
          </Button>
        }
      />

      {showForm && (
        <Card className="animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="mb-4 border-b border-slate-800 pb-3">
            <h3 className="text-lg font-semibold text-slate-100">Grant New Reward</h3>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Employee</label>
                <select 
                  className="w-full bg-slate-950 border border-slate-800 rounded-md p-2.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                  value={formData.employee_id}
                  onChange={(e) => setFormData({ ...formData, employee_id: parseInt(e.target.value) })}
                  required
                >
                  <option value={0}>Select Employee</option>
                  {employees?.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Reward Type</label>
                <select 
                  className="w-full bg-slate-950 border border-slate-800 rounded-md p-2.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                  value={formData.reward_type}
                  onChange={(e) => setFormData({ ...formData, reward_type: e.target.value as RewardType })}
                  required
                >
                  <option value="POINTS">Points</option>
                  <option value="MONEY">Money / Bonus</option>
                  <option value="BADGE">Achievement Badge</option>
                </select>
              </div>
              {formData.reward_type === "POINTS" && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Points</label>
                  <Input 
                    type="number" 
                    className="bg-slate-950 border-slate-800 focus:ring-indigo-500/50"
                    placeholder="Enter points"
                    value={formData.points || ""}
                    onChange={(e) => setFormData({ ...formData, points: parseInt(e.target.value) || 0 })}
                  />
                </div>
              )}
              {formData.reward_type === "MONEY" && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Amount (Rs.)</label>
                  <Input 
                    type="number" 
                    className="bg-slate-950 border-slate-800 focus:ring-indigo-500/50"
                    placeholder="Enter amount"
                    value={formData.amount || ""}
                    onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Reason</label>
              <textarea 
                className="w-full bg-slate-950 border border-slate-800 rounded-md p-3 text-sm text-slate-100 min-h-[100px] outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-slate-600"
                placeholder="Why is this employee being rewarded?"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                required
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[140px]">
                Grant Reward
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" /> Recent Rewards history
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wider">
                <th className="py-3 px-2 font-medium opacity-70">Date</th>
                <th className="py-3 px-2 font-medium opacity-70">Employee</th>
                <th className="py-3 px-2 font-medium opacity-70">Type</th>
                <th className="py-3 px-2 font-medium opacity-70">Value</th>
                <th className="py-3 px-2 font-medium opacity-70">Reason</th>
                <th className="py-3 px-2 font-medium opacity-70 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
                {rewards?.map((reward) => (
                  <tr key={reward.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="py-4 px-2 text-slate-400">
                      {reward.given_at ? new Date(reward.given_at).toLocaleDateString() : "N/A"}
                    </td>
                    <td className="py-4 px-2 font-medium text-slate-100">
                      {employees?.find(e => e.id === reward.employee_id)?.full_name || `ID: ${reward.employee_id}`}
                    </td>
                    <td className="py-4 px-2">
                      {reward.reward_type === "POINTS" && <span className="flex items-center gap-1.5 text-indigo-400 font-medium"><Coins className="w-3.5 h-3.5" /> Points</span>}
                      {reward.reward_type === "MONEY" && <span className="flex items-center gap-1.5 text-emerald-400 font-medium"><Gift className="w-3.5 h-3.5" /> Money</span>}
                      {reward.reward_type === "BADGE" && <span className="flex items-center gap-1.5 text-purple-400 font-medium"><Award className="w-3.5 h-3.5" /> Badge</span>}
                    </td>
                    <td className="py-4 px-2 text-slate-200">
                      {reward.reward_type === "POINTS" ? (
                        <span className="font-bold">{reward.points} <span className="text-[10px] text-slate-500 uppercase ml-0.5">pts</span></span>
                      ) : (
                        <span className="font-bold"><span className="text-xs text-slate-500 mr-0.5">Rs.</span>{reward.amount?.toLocaleString()}</span>
                      )}
                    </td>
                    <td className="py-4 px-2 text-slate-400 max-w-xs truncate" title={reward.reason}>
                      {reward.reason}
                    </td>
                    <td className="py-4 px-2 text-right">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8 text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                        onClick={() => handleRevoke(reward.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(rewards?.length === 0 || !rewards) && (
              <div className="py-12 text-center text-slate-500 italic">No rewards have been granted yet. Use the &quot;Grant Reward&quot; button to get started.</div>
            )}
          </div>
        </Card>
    </div>
  );
}
