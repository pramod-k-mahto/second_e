"use client";

import { useEffect, useMemo, useState, KeyboardEvent, useRef } from "react";
import { Search as LucideSearch, Compass, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { menuHrefFromCode } from "@/lib/menuRouting";

export interface MenuSearchItem {
  id: number | string;
  label: string;
  module?: string | null;
  code: string;
  href?: string | null;
  parent_id?: number | null;
}

export interface MenuSearchDialogProps {
  open: boolean;
  onClose: () => void;
  menus: MenuSearchItem[];
  onSelect?: (item: MenuSearchItem) => void;
  /** Used when a menu row has no precomputed href (e.g. company context). */
  companyId?: number | string | null;
}

function resolveMenuHref(item: MenuSearchItem, companyId?: number | string | null): string | null {
  const raw = item.href?.trim();
  if (raw && raw !== "#") return raw;
  if (companyId === undefined || companyId === null || companyId === "") return null;
  const n = Number(companyId);
  if (!Number.isFinite(n)) return null;
  return menuHrefFromCode(n, item.code);
}

export function MenuSearchDialog({ open, onClose, menus, onSelect, companyId }: MenuSearchDialogProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setSearch("");
      setHighlightIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const sortedBrowse = [...menus].sort((a, b) =>
      (a.label || "").localeCompare(b.label || "", undefined, { sensitivity: "base" })
    );

    // Opening the palette with no query used to show zero rows — offer a short browse list.
    if (!term) {
      const preferredCodes = new Set([
        "accounting.masters.sales-persons",
        "accounting.masters.sales-person",
        "accounting.masters.sales_person",
        "accounting.masters.sales_persons",
        "reports.employee_cost",
      ]);
      const preferred = sortedBrowse.filter((m) =>
        preferredCodes.has(String(m.code || "").trim().toLowerCase())
      );
      const rest = sortedBrowse.filter(
        (m) => !preferredCodes.has(String(m.code || "").trim().toLowerCase())
      );
      return [...preferred, ...rest].slice(0, 22);
    }

    const terms = term.split(/\s+/).filter(Boolean);

    return menus
      .filter((m) => {
        const label = (m.label || "").toLowerCase();
        const moduleStr = String(m.module || "").toLowerCase();
        const code = String(m.code || "").toLowerCase();

        const clean = (s: string) => s.replace(/[\s\-_]/g, "");
        const cleanTerm = clean(term);
        const cleanLabel = clean(label);
        const cleanCode = clean(code);
        const combined = `${label} ${moduleStr} ${code}`;
        const cleanCombined = clean(combined);

        if (terms.length <= 1) {
          return (
            label.includes(term) ||
            moduleStr.includes(term) ||
            code.includes(term) ||
            cleanLabel.includes(cleanTerm) ||
            cleanCode.includes(cleanTerm)
          );
        }
        return terms.every(
          (t) =>
            combined.includes(t) ||
            cleanCombined.includes(clean(t))
        );
      })
      .sort((a, b) => {
        const aLabel = (a.label || "").toLowerCase();
        const bLabel = (b.label || "").toLowerCase();

        // Exact starts with gets priority
        if (aLabel.startsWith(term) && !bLabel.startsWith(term)) return -1;
        if (!aLabel.startsWith(term) && bLabel.startsWith(term)) return 1;

        return aLabel.localeCompare(bLabel);
      })
      .slice(0, 12);
  }, [menus, search]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [search]);

  const handleSelect = (item: MenuSearchItem) => {
    if (onSelect) {
      onSelect(item);
      onClose();
      return;
    }
    const href = resolveMenuHref(item, companyId);
    if (!href) return;
    router.push(href);
    onClose();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % Math.max(filtered.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = filtered[highlightIndex];
      if (it && (onSelect || resolveMenuHref(it, companyId))) {
        handleSelect(it);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200000] flex items-start justify-center pt-[15vh] px-4">
      {/* Backdrop with premium blur */}
      <div 
        className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity animate-in fade-in duration-200" 
        onClick={onClose}
      />
      
      {/* Command palette panel — z-10 so it stays above the full-screen backdrop for clicks */}
      <div 
        className="relative z-10 w-full max-w-lg rounded-[17px] p-[1.5px] bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 shadow-[0_0_40px_-5px_rgba(99,102,241,0.4)] animate-in zoom-in-95 fade-in duration-200"
        onKeyDown={handleKeyDown}
      >
        {/* Inner Window */}
        <div className="relative w-full bg-white dark:bg-slate-900 rounded-2xl overflow-hidden flex flex-col">
          {/* Search Header */}
          <div className="flex items-center px-4 border-b border-indigo-50/80 dark:border-slate-800 bg-gradient-to-r from-indigo-50/50 to-purple-50/50 dark:from-indigo-900/10 dark:to-purple-900/10">
            <LucideSearch className="w-4 h-4 text-indigo-500 mr-2.5" />
            <input
              ref={inputRef}
              type="text"
              className="flex-1 py-3.5 bg-transparent border-none outline-none text-[15px] text-slate-800 dark:text-slate-100 placeholder:text-indigo-300/80 font-semibold"
            placeholder="Search menus, features, or tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === "Escape") {
                  handleKeyDown(e);
                }
              }}
          />
          <div className="flex items-center gap-2 ml-2">
            <kbd className="hidden sm:inline-flex h-4.5 items-center justify-center rounded border border-indigo-100 bg-white px-1.5 font-mono text-[9px] font-bold text-indigo-400 dark:border-slate-700 dark:bg-slate-800/50">
              ESC
            </kbd>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/20 text-slate-400 hover:text-rose-500 transition-colors"
              title="Close Search"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Results Body */}
        <div 
          ref={listRef}
          className="max-h-[350px] overflow-y-auto py-2 custom-scrollbar bg-slate-50/30 dark:bg-slate-900/50"
        >
          {search.trim() === "" && filtered.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/40 dark:to-purple-900/40 mb-3 shadow-inner">
                <Compass className="w-5 h-5 text-indigo-500" />
              </div>
              <p className="text-[13px] font-semibold text-slate-600 dark:text-slate-400">
                No menus available for search.
              </p>
            </div>
          ) : search.trim() !== "" && filtered.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-100 to-orange-100 dark:from-rose-900/40 dark:to-orange-900/40 mb-3 shadow-inner">
                <X className="w-5 h-5 text-rose-500" />
              </div>
              <p className="text-[13px] font-semibold text-slate-600 dark:text-slate-400">
                No features found for &quot;<span className="font-bold text-rose-500">{search}</span>&quot;
              </p>
            </div>
          ) : (
            <div className="space-y-0.5 px-2">
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Menus & Features
              </div>
              {filtered.map((item, index) => {
                const isActive = index === highlightIndex;
                const canNavigate = !!(onSelect || resolveMenuHref(item, companyId));
                return (
                  <button
                    key={`${item.code}-${item.id}`}
                    type="button"
                    disabled={!canNavigate}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-all duration-150 text-left ${
                      isActive 
                        ? "bg-indigo-600 text-white shadow-sm shadow-indigo-100 dark:shadow-none" 
                        : "hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                    } ${!canNavigate ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    onClick={() => {
                      if (canNavigate) handleSelect(item);
                    }}
                    onMouseEnter={() => setHighlightIndex(index)}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`h-6 w-6 flex items-center justify-center rounded border ${
                        isActive ? "bg-indigo-500/50 border-indigo-400/30" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                      }`}>
                        <span className={`text-[10px] font-bold ${isActive ? "text-white" : "text-slate-500"}`}>
                          {item.label.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="text-left flex flex-col justify-center">
                        <div className={`text-xs font-semibold leading-tight tracking-tight ${isActive ? "text-white" : "text-slate-800 dark:text-slate-200"}`}>
                          {item.label}
                        </div>
                      </div>
                    </div>
                    {isActive && canNavigate && (
                      <div className="flex items-center gap-1.5 animate-in slide-in-from-right-1">
                        <span className={`text-[9px] font-semibold ${isActive ? "text-indigo-200" : ""}`}>↵ Select</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-purple-50/50 dark:border-slate-800 bg-gradient-to-r from-purple-50/30 to-pink-50/30 dark:from-slate-900 dark:to-slate-900">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <kbd className="inline-flex h-4.5 w-4.5 items-center justify-center rounded border border-slate-200/60 bg-white font-mono text-[9px] font-extrabold text-slate-600 dark:border-slate-700 dark:bg-slate-800 shadow-sm">
                ↵
              </kbd>
              <span className="text-[9.5px] font-bold text-slate-500 tracking-wide">Select</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex gap-0.5">
                <kbd className="inline-flex h-4.5 w-4.5 items-center justify-center rounded border border-slate-200/60 bg-white font-mono text-[9px] font-extrabold text-slate-600 dark:border-slate-700 dark:bg-slate-800 shadow-sm">
                  ↑
                </kbd>
                <kbd className="inline-flex h-4.5 w-4.5 items-center justify-center rounded border border-slate-200/60 bg-white font-mono text-[9px] font-extrabold text-slate-600 dark:border-slate-700 dark:bg-slate-800 shadow-sm">
                  ↓
                </kbd>
              </div>
              <span className="text-[9.5px] font-bold text-slate-500 tracking-wide">Navigate</span>
            </div>
          </div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500">
             Master Search
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
