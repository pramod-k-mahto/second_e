"use client";

import React, { useState } from "react";
import { 
  Phone, 
  Mail, 
  Users, 
  MessageSquare, 
  MessageCircle,
  X,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { InteractionType } from "@/lib/interactions/types";
import { useLogInteraction } from "@/lib/interactions/queries";

interface LogInteractionModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  customerId: number;
  customerName?: string;
  taskId: number;
  employeeId: number;
  employees: any[];
}

export function LogInteractionModal({
  isOpen,
  onClose,
  companyId,
  customerId,
  customerName,
  taskId,
  employeeId,
  employees
}: LogInteractionModalProps) {
  const logMutation = useLogInteraction();
  const [formData, setFormData] = useState({
    interaction_type: "CALL" as InteractionType,
    notes: "",
    interaction_date: new Date().toISOString().split('T')[0],
    employee_id: employeeId
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await logMutation.mutateAsync({
        companyId,
        interaction: {
          customer_id: customerId,
          employee_id: formData.employee_id,
          interaction_type: formData.interaction_type,
          notes: formData.notes,
          interaction_date: new Date(formData.interaction_date).toISOString(),
          task_id: taskId
        }
      });
      onClose();
    } catch (error) {
      console.error("Failed to log interaction:", error);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Log Interaction</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Recording details for {customerName || "Customer"}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Type">
              <select 
                className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                value={formData.interaction_type}
                onChange={e => setFormData({ ...formData, interaction_type: e.target.value as InteractionType })}
              >
                <option value="CALL">Phone Call</option>
                <option value="EMAIL">Email</option>
                <option value="MEETING">Meeting</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="OTHER">Other</option>
              </select>
            </FormField>
            
            <FormField label="Date">
              <Input 
                type="date"
                value={formData.interaction_date}
                onChange={e => setFormData({ ...formData, interaction_date: e.target.value })}
                className="rounded-xl h-10"
              />
            </FormField>
          </div>

          <FormField label="Logged By">
            <select 
              className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              value={formData.employee_id}
              onChange={e => setFormData({ ...formData, employee_id: parseInt(e.target.value) })}
            >
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.full_name || emp.name}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Notes">
            <textarea 
              placeholder="What was discussed?"
              rows={4}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              required
            />
          </FormField>

          <div className="flex justify-end gap-3 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              className="rounded-xl px-6"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={logMutation.isPending}
              className="rounded-xl px-6 bg-indigo-600 hover:bg-indigo-700 text-white min-w-[120px]"
            >
              {logMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : "Save Log"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
