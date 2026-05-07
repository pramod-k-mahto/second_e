"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { api, getApiErrorMessage } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

interface QuickCustomerModalProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  onSuccess: (newId: number, name: string) => void;
  /** Called when user clicks "Open full form". Parent saves draft if needed then navigates. */
  onGoToFullForm?: () => void;
}

export function QuickCustomerModal({
  open,
  onClose,
  companyId,
  onSuccess,
  onGoToFullForm,
}: QuickCustomerModalProps) {
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setPhone("");
      setEmail("");
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Customer name is required");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await api.post(`/companies/${companyId}/customers`, {
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
      });
      const newCustomer = res.data;

      showToast({
        title: "Customer Created",
        description: `"${name.trim()}" has been added successfully.`,
        variant: "success",
      });

      onSuccess(newCustomer.id, newCustomer.name);
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Quick Add Customer" size="md">
      <form onSubmit={handleSubmit} className="space-y-4 py-2">
        {onGoToFullForm && (
          <div className="flex items-center justify-between rounded-lg border border-indigo-100 dark:border-indigo-800/50 bg-indigo-50/60 dark:bg-indigo-900/20 px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs text-indigo-700 dark:text-indigo-300">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
              </svg>
              Need to fill billing, tax, credit, or other details?
            </div>
            <button
              type="button"
              onClick={() => { onClose(); onGoToFullForm(); }}
              className="ml-3 shrink-0 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 underline underline-offset-2 transition-colors whitespace-nowrap"
            >
              Open full form →
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter customer name"
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Phone
              </label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone number"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
              />
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

        <div className="flex justify-end gap-2 pt-2 border-t dark:border-slate-800">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" isLoading={submitting}>
            Add Customer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
