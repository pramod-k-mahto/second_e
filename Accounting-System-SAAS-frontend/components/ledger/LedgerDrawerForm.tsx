"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface LedgerFormValues {
  name: string;
  groupId: string;
  openingBalance: string;
  openingType: "DR" | "CR";
  email: string;
  phone: string;
  address: string;
  gstLedgerId: string;
}

interface LedgerDrawerFormProps {
  open: boolean;
  onClose: () => void;
  groups: { id: number; name: string }[];
  gstLedgers: { id: number; name: string }[];
  initialValues?: Partial<LedgerFormValues>;
  onSubmit: (values: LedgerFormValues) => void;
}

const emptyValues: LedgerFormValues = {
  name: "",
  groupId: "",
  openingBalance: "",
  openingType: "DR",
  email: "",
  phone: "",
  address: "",
  gstLedgerId: "",
};

export function LedgerDrawerForm({
  open,
  onClose,
  groups,
  gstLedgers,
  initialValues,
  onSubmit,
}: LedgerDrawerFormProps) {
  const [values, setValues] = useState<LedgerFormValues>(emptyValues);
  const [errors, setErrors] = useState<Partial<Record<keyof LedgerFormValues, string>>>({});

  // --- Searchable Group combobox state ---
  const [groupSearch, setGroupSearch] = useState("");
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const groupComboRef = useRef<HTMLDivElement>(null);

  const selectedGroupName =
    groups.find((g) => String(g.id) === String(values.groupId))?.name ?? "";

  const filteredGroups = groupSearch.trim()
    ? groups.filter((g) =>
      g.name.toLowerCase().includes(groupSearch.trim().toLowerCase())
    )
    : groups;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        groupComboRef.current &&
        !groupComboRef.current.contains(e.target as Node)
      ) {
        // Delay so click on dropdown item registers first
        setTimeout(() => setGroupDropdownOpen(false), 150);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    setValues({ ...emptyValues, ...initialValues });
    setErrors({});
    setGroupSearch("");
    setGroupDropdownOpen(false);
  }, [initialValues, open]);

  const handleChange = (field: keyof LedgerFormValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleReset = () => {
    setValues(emptyValues);
    setErrors({});
    setGroupSearch("");
    setGroupDropdownOpen(false);
  };

  const handleSubmit = () => {
    const errs: typeof errors = {};
    if (!values.name.trim()) errs.name = "Ledger Name is required.";
    if (!values.groupId) errs.groupId = "Ledger Group is required.";
    if (values.openingBalance && isNaN(Number(values.openingBalance))) {
      errs.openingBalance = "Opening balance must be numeric.";
    }
    if (values.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)) {
      errs.email = "Invalid email address.";
    }
    if (values.phone && values.phone.length < 5) {
      errs.phone = "Phone number looks too short.";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSubmit(values);
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        />
      )}
      <aside
        className={[
          "fixed inset-y-0 right-0 z-40 w-full max-w-md transform border-l bg-white shadow-xl transition-transform duration-200 ease-out",
          "dark:border-slate-800 dark:bg-slate-950",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-xs dark:border-slate-800">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Ledger
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                {initialValues?.name ? "Edit Ledger" : "New Ledger"}
              </div>
            </div>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={onClose}
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 text-xs">
            <div className="space-y-3">
              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
                  Ledger Name
                </label>
                <Input
                  value={values.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  className="h-8 text-xs"
                />
                {errors.name && (
                  <p className="mt-0.5 text-[11px] text-red-600">{errors.name}</p>
                )}
              </div>

              {/* ── Searchable Group Combobox ── */}
              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
                  Ledger Group
                </label>
                <div ref={groupComboRef} className="relative">
                  {/* Search input */}
                  <div className="relative flex h-8 items-center rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    {/* Magnifier icon */}
                    <svg
                      className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-slate-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
                      />
                    </svg>
                    <input
                      type="text"
                      className="h-full w-full rounded-md bg-transparent pl-7 pr-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
                      placeholder={
                        selectedGroupName
                          ? selectedGroupName
                          : "Search group..."
                      }
                      value={groupSearch}
                      onChange={(e) => {
                        setGroupSearch(e.target.value);
                        setGroupDropdownOpen(true);
                        // Clear selection if user clears the text
                        if (!e.target.value && values.groupId) {
                          handleChange("groupId", "");
                        }
                      }}
                      onFocus={() => setGroupDropdownOpen(true)}
                    />
                    {/* Clear button */}
                    {(groupSearch || values.groupId) && (
                      <button
                        type="button"
                        className="absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        onClick={() => {
                          setGroupSearch("");
                          handleChange("groupId", "");
                          setGroupDropdownOpen(true);
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Dropdown list */}
                  {groupDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-0.5 max-h-52 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                      {filteredGroups.length === 0 ? (
                        <div className="px-3 py-2 text-[11px] text-slate-400">
                          No groups match &quot;{groupSearch}&quot;
                        </div>
                      ) : (
                        filteredGroups.map((g) => (
                          <button
                            key={g.id}
                            type="button"
                            className={[
                              "flex w-full items-center px-3 py-1.5 text-left text-xs hover:bg-blue-50 dark:hover:bg-slate-800",
                              String(g.id) === String(values.groupId)
                                ? "bg-blue-50 font-medium text-blue-700 dark:bg-slate-800 dark:text-blue-400"
                                : "text-slate-800 dark:text-slate-100",
                            ].join(" ")}
                            onClick={() => {
                              handleChange("groupId", String(g.id));
                              setGroupSearch("");
                              setGroupDropdownOpen(false);
                            }}
                          >
                            {g.name}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {errors.groupId && (
                  <p className="mt-0.5 text-[11px] text-red-600">{errors.groupId}</p>
                )}
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
                    Opening Balance
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={values.openingBalance}
                    onChange={(e) => handleChange("openingBalance", e.target.value)}
                    className="h-8 text-xs"
                  />
                  {errors.openingBalance && (
                    <p className="mt-0.5 text-[11px] text-red-600">
                      {errors.openingBalance}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
                    Dr/Cr
                  </label>
                  <select
                    className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={values.openingType}
                    onChange={(e) =>
                      handleChange("openingType", e.target.value as "DR" | "CR")
                    }
                  >
                    <option value="DR">Dr</option>
                    <option value="CR">Cr</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
                    Email
                  </label>
                  <Input
                    value={values.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    className="h-8 text-xs"
                  />
                  {errors.email && (
                    <p className="mt-0.5 text-[11px] text-red-600">{errors.email}</p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
                    Phone
                  </label>
                  <Input
                    value={values.phone}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    className="h-8 text-xs"
                  />
                  {errors.phone && (
                    <p className="mt-0.5 text-[11px] text-red-600">{errors.phone}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
                  Address
                </label>
                <textarea
                  rows={3}
                  className="w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={values.address}
                  onChange={(e) => handleChange("address", e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
                  Linked GST/VAT Ledger (optional)
                </label>
                <select
                  className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={values.gstLedgerId}
                  onChange={(e) => handleChange("gstLedgerId", e.target.value)}
                >
                  <option value="">None</option>
                  {gstLedgers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-xs dark:border-slate-800">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleReset}
            >
              Reset
            </Button>
            <div className="space-x-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={handleSubmit}
              >
                Submit
              </Button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
