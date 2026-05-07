"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { api, getApiErrorMessage } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

interface QuickEmployeeModalProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  onSuccess: (newId: number) => void;
}

export function QuickEmployeeModal({
  open,
  onClose,
  companyId,
  onSuccess,
}: QuickEmployeeModalProps) {
  const { showToast } = useToast();
  const [fullName, setFullName] = useState("");
  const [code, setCode] = useState("");
  const [payrollMode, setPayrollMode] = useState("MONTHLY");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFullName("");
      setCode("");
      setPayrollMode("MONTHLY");
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError("Full Name is required");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        full_name: fullName.trim(),
        code: code.trim() || null,
        payroll_mode: payrollMode,
        is_active: true,
      };

      const res = await api.post(`/payroll/companies/${companyId}/employees`, payload);
      const newItem = res.data;

      showToast({
        title: "Employee Created",
        description: `Successfully created ${fullName}`,
        variant: "success",
      });

      onSuccess(newItem.id);
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Quick Create Employee" size="md">
      <form onSubmit={handleSubmit} className="space-y-4 py-2">
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Full Name *</label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter employee full name"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Employee Code (Optional)</label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter employee code"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Payroll Mode</label>
            <Select
              value={payrollMode}
              onChange={(e) => setPayrollMode(e.target.value)}
            >
              <option value="MONTHLY">Monthly</option>
              <option value="DAILY">Daily</option>
              <option value="HOURLY">Hourly</option>
            </Select>
          </div>
        </div>

        {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

        <div className="flex justify-end gap-2 pt-2 border-t dark:border-slate-800">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" isLoading={submitting}>
            Create Employee
          </Button>
        </div>
        <div className="mt-2 text-center text-[10px] text-slate-400">
          Need more fields? Go to <a href={`/companies/${companyId}/payroll/employees`} target="_blank" className="text-brand-500 hover:underline">Full Employee Form</a>
        </div>
      </form>
    </Modal>
  );
}
