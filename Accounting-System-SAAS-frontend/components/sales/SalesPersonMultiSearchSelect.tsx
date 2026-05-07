"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { Option } from "@/components/ui/SearchableSelect";

/** Parse comma / semicolon / whitespace separated ids from stored line/header value */
export function parseSalesPersonIds(raw: string | undefined | null): string[] {
  if (raw == null || String(raw).trim() === "") return [];
  return String(raw)
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((id, i, arr) => arr.indexOf(id) === i);
}

export function formatSalesPersonIdsFromList(ids: Iterable<string>): string {
  const uniq = [...new Set([...ids].map((s) => String(s).trim()).filter(Boolean))];
  uniq.sort((a, b) => Number(a) - Number(b));
  return uniq.join(",");
}

export function mergeSalesPersonCsv(existing: string | undefined | null, newId: string): string {
  return formatSalesPersonIdsFromList([...parseSalesPersonIds(existing), String(newId)]);
}

/** First id is sent to the API as `sales_person_id` */
export function primarySalesPersonIdNum(raw: string | undefined | null): number | null {
  const first = parseSalesPersonIds(raw)[0];
  if (!first) return null;
  const n = Number(first);
  return Number.isFinite(n) ? n : null;
}

type SalesPersonMultiSearchSelectProps = {
  options: Option[];
  value: string;
  onChange: (commaSeparatedIds: string) => void;
  onQuickCreate: () => void;
  placeholder?: string;
  searchInputPlaceholder?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
};

export function SalesPersonMultiSearchSelect({
  options,
  value,
  onChange,
  onQuickCreate,
  placeholder = "Select…",
  searchInputPlaceholder = "Search by name or ID…",
  className = "",
  triggerClassName = "",
  disabled = false,
}: SalesPersonMultiSearchSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [draft, setDraft] = useState<Set<string>>(() => new Set(parseSalesPersonIds(value)));

  const triggerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  /** Ref on portaled dropdown — do not rely on getElementById(useId) alone (can miss and close on inside clicks). */
  const portalRef = useRef<HTMLDivElement | null>(null);
  const portalId = useId().replace(/:/g, "").replace(/[^a-zA-Z0-9_-]/g, "");

  const optionById = useMemo(() => {
    const m = new Map<string, Option>();
    for (const o of options) {
      if (o.value) m.set(o.value, o);
    }
    return m;
  }, [options]);

  const filteredOptions = useMemo(() => {
    const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return options;
    return options.filter((o) => {
      if (!o.value) return false;
      const combined = `${o.label} ${o.sublabel ?? ""}`.toLowerCase();
      return terms.every((term) => combined.includes(term));
    });
  }, [options, search]);

  const triggerLabel = useMemo(() => {
    const ids = parseSalesPersonIds(value);
    if (ids.length === 0) return null;
    if (ids.length === 1) {
      const o = optionById.get(ids[0]);
      return o?.label ?? `#${ids[0]}`;
    }
    const names = ids
      .slice(0, 2)
      .map((id) => optionById.get(id)?.label ?? `#${id}`);
    const extra = ids.length > 2 ? ` +${ids.length - 2}` : "";
    return `${names.join(", ")}${extra}`;
  }, [value, optionById]);

  const reposition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const minWidth = 400;
    const viewportWidth = window.innerWidth;
    const dropdownWidth = Math.max(rect.width, Math.min(minWidth, viewportWidth - 32));
    let left = rect.left;
    if (left + dropdownWidth > viewportWidth) {
      left = viewportWidth - dropdownWidth - 16;
    }
    if (left < 16) left = 16;
    setDropdownStyle({
      position: "fixed",
      left,
      top: rect.bottom + 8,
      width: dropdownWidth,
      zIndex: 99999,
    });
  }, []);

  const open = () => {
    if (disabled) return;
    reposition();
    setDraft(new Set(parseSalesPersonIds(value)));
    setSearch("");
    setIsOpen(true);
  };

  const close = useCallback(() => {
    setIsOpen(false);
    setSearch("");
  }, []);

  const apply = () => {
    onChange(formatSalesPersonIdsFromList(draft));
    close();
  };

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target) || portalRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = () => reposition();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [isOpen, reposition]);

  useEffect(() => {
    if (isOpen) setTimeout(() => searchRef.current?.focus(), 10);
  }, [isOpen]);

  const toggleId = (id: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const dropdown = isOpen && !disabled && (
    <div
      ref={portalRef}
      id={`sp-multi-select-portal-${portalId || "x"}`}
      style={dropdownStyle}
      className="rounded-xl border border-slate-200/60 dark:border-slate-700/60 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-[0_20px_50px_rgba(0,0,0,0.2)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.4)] ring-1 ring-black/5 dark:ring-white/10 overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200 flex flex-col max-h-[min(22rem,calc(100vh-8rem))]"
    >
      <div className="sticky top-0 bg-white/50 dark:bg-slate-900/50 px-3 py-3 border-b border-slate-100/80 dark:border-slate-800/80 shrink-0">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
              clipRule="evenodd"
            />
          </svg>
          <input
            ref={searchRef}
            type="text"
            className="w-full pl-9 pr-4 py-2 text-[13px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all shadow-sm"
            placeholder={searchInputPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
            }}
          />
        </div>
      </div>

      <div className="border-b border-slate-100/80 dark:border-slate-800/80 px-1 py-1 shrink-0 bg-white/80 dark:bg-slate-900/80">
        <button
          type="button"
          className="w-full text-left cursor-pointer border-l-[3px] px-4 py-2.5 transition-colors border-l-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-sm"
          onMouseDown={(e) => {
            e.preventDefault();
            onQuickCreate();
            close();
          }}
        >
          <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">+ Add New</span>
        </button>
      </div>

      <div className="overflow-y-auto flex-1 min-h-[10.5rem] max-h-[14rem] py-1">
        {options.length === 0 ? (
          <div className="px-3 py-3 text-xs text-amber-600 text-center font-medium">
            No sales persons loaded. Check company or refresh the page.
          </div>
        ) : filteredOptions.length === 0 ? (
          <div className="px-3 py-3 text-xs text-slate-400 text-center italic">No results found</div>
        ) : (
          filteredOptions.filter((o) => o.value).map((option) => {
            const checked = draft.has(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={() => toggleId(option.value)}
                className={`flex w-full items-start gap-2.5 px-3 py-2.5 mx-1 rounded-md text-left transition-colors border-l-[3px] ${
                  checked
                    ? "bg-indigo-50/90 dark:bg-indigo-900/40 border-l-indigo-500"
                    : "border-l-transparent hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center rounded border-2 ${
                    checked
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-slate-500 bg-white dark:border-slate-400 dark:bg-slate-900"
                  }`}
                  aria-hidden
                >
                  {checked && (
                    <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0 flex-1 select-none">
                  <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug">
                    {option.label}
                  </span>
                  {option.sublabel && (
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                      {option.sublabel}
                    </span>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">
        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
          {draft.size === 0 ? "None selected" : `${draft.size} selected`}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            className="px-2.5 py-1.5 text-[11px] font-semibold rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setDraft(new Set())}
          >
            Clear
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-[11px] font-bold rounded-md bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={apply}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      <div
        ref={triggerRef}
        className={`flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm transition-all min-h-[2.25rem] px-3 py-2 text-sm ${
          triggerClassName
        } ${
          disabled
            ? "cursor-not-allowed bg-slate-50 dark:bg-slate-800/50 opacity-60"
            : "cursor-pointer hover:border-indigo-400 hover:ring-2 hover:ring-indigo-400/10 focus:ring-2 focus:ring-indigo-400/20"
        } ${isOpen ? "ring-2 ring-indigo-400/20 border-indigo-400" : ""}`}
        onClick={isOpen ? close : open}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div className="flex flex-col truncate min-w-0 flex-1">
          <span
            className={`truncate text-sm font-medium leading-snug ${
              triggerLabel ? "text-slate-800 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"
            }`}
          >
            {triggerLabel ?? placeholder}
          </span>
          {parseSalesPersonIds(value).length > 1 && (
            <span className="text-[10px] text-slate-400 truncate leading-tight">
              Primary for posting:{" "}
              {optionById.get(parseSalesPersonIds(value)[0])?.label ?? `#${parseSalesPersonIds(value)[0]}`}
            </span>
          )}
        </div>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180 text-indigo-500" : ""}`}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </div>

      {typeof window !== "undefined" && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
