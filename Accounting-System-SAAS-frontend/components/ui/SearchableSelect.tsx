"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo, useId } from "react";
import { createPortal } from "react-dom";

export interface Option {
    value: string;
    label: string;
    sublabel?: string;   // optional secondary info shown in dropdown only
}

interface SearchableSelectProps {
    options: Option[];
    /** Shown first; never filtered out by search (e.g. “+ Add new”) */
    pinnedOptions?: Option[];
    /**
     * First N rows of `options` are fixed under the search box (above the scroll area),
     * like native `<select>`’s leading options — survives cases where callers only bundle add-new in main list.
     */
    stickyFirstCount?: number;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    /** Placeholder for the dropdown search field */
    searchInputPlaceholder?: string;
    className?: string;        // wrapper class
    triggerClassName?: string; // inner trigger class
    disabled?: boolean;
}

export function SearchableSelect({
    options,
    pinnedOptions = [],
    stickyFirstCount = 0,
    value,
    onChange,
    placeholder = "Select...",
    searchInputPlaceholder = "Type to search...",
    className = "",
    triggerClassName = "",
    disabled = false,
}: SearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
    const [highlightIndex, setHighlightIndex] = useState(0);

    const triggerRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const stickyFromOptions = useMemo(
        () =>
            stickyFirstCount > 0 ? options.slice(0, stickyFirstCount) : [],
        [options, stickyFirstCount]
    );

    const scrollSourceOptions = useMemo(
        () =>
            stickyFirstCount > 0 ? options.slice(stickyFirstCount) : options,
        [options, stickyFirstCount]
    );

    /** Fixed below search + above scroll — explicit pinned rows + sticky option prefix */
    const pinBlockRows = useMemo(
        () => [...(pinnedOptions ?? []), ...stickyFromOptions],
        [pinnedOptions, stickyFromOptions]
    );

    const pinnedValues = useMemo(() => {
        const s = new Set((pinnedOptions ?? []).map((o) => o.value));
        stickyFromOptions.forEach((o) => s.add(o.value));
        return s;
    }, [pinnedOptions, stickyFromOptions]);

    const selectedOption = useMemo(() => {
        const merged = [...pinBlockRows, ...scrollSourceOptions];
        return merged.find((o) => o.value === value);
    }, [pinBlockRows, scrollSourceOptions, value]);

    /** Scrollable rows (never includes sticky-first prefix); filtered by dropdown search */
    const filteredMainOptions = useMemo(() => {
        const pool = scrollSourceOptions.filter((o) => !pinnedValues.has(o.value));
        const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
        if (terms.length === 0) return pool;
        return pool.filter((o) => {
            const combined = `${o.label} ${o.sublabel ?? ""}`.toLowerCase();
            return terms.every((term) => combined.includes(term));
        });
    }, [options, search, pinnedValues]);

    const displayOptions = useMemo(
        () => [...pinBlockRows, ...filteredMainOptions],
        [pinBlockRows, filteredMainOptions]
    );

    const pinned = pinBlockRows;

    /** Reset highlighted row when list changes while open */
    useEffect(() => {
        if (isOpen) setHighlightIndex(0);
    }, [search, isOpen, displayOptions.length]);

    /** Position the portal dropdown under the trigger — always below */
    const reposition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();

        // Increase width for better search visibility, but at least trigger width
        const minWidth = 400;
        const viewportWidth = window.innerWidth;
        const dropdownWidth = Math.max(rect.width, Math.min(minWidth, viewportWidth - 32));

        // Adjust horizontal position if it overflows the viewport
        let left = rect.left;
        if (left + dropdownWidth > viewportWidth) {
            left = viewportWidth - dropdownWidth - 16; // 16px padding from edge
        }
        if (left < 16) left = 16;

        setDropdownStyle({
            position: "fixed",
            left: left,
            top: rect.bottom + 8, // slight offset for "floating" feel
            width: dropdownWidth,
            zIndex: 99999,
        });
    }, []);

    const open = () => {
        if (disabled) return;
        reposition();
        setHighlightIndex(0);
        setIsOpen(true);
    };

    const close = () => {
        setIsOpen(false);
        setSearch("");
    };

    const portalId = useId().replace(/:/g, "");

    /** Close on outside click */
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            const portalEl = document.getElementById(`searchable-select-portal-${portalId}`);
            if (
                wrapperRef.current?.contains(target) ||
                portalEl?.contains(target)
            ) return;
            close();
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [isOpen]);

    /** Reposition on scroll / resize while open */
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

    /** Auto-focus search when dropdown opens */
    useEffect(() => {
        if (isOpen) setTimeout(() => searchRef.current?.focus(), 10);
    }, [isOpen]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (disabled) return;

        if (!isOpen) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                open();
            }
            return;
        }

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightIndex(prev => (prev + 1) % Math.max(displayOptions.length, 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightIndex(prev => (prev - 1 + Math.max(displayOptions.length, 1)) % Math.max(displayOptions.length, 1));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const option = displayOptions[highlightIndex];
            if (option) {
                onChange(option.value);
                close();
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            close();
        } else if (e.key === "Tab") {
            close();
        }
    };

    const dropdown = isOpen && !disabled && (
        <div
            id={`searchable-select-portal-${portalId}`}
            style={dropdownStyle}
            className="rounded-xl border border-slate-200/60 dark:border-slate-700/60 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-[0_20px_50px_rgba(0,0,0,0.2)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.4)] ring-1 ring-black/5 dark:ring-white/10 overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200"
        >
            {/* Search input */}
            <div className="sticky top-0 bg-white/50 dark:bg-slate-900/50 px-3 py-3 border-b border-slate-100/80 dark:border-slate-800/80">
                <div className="relative">
                    <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                        viewBox="0 0 20 20" fill="currentColor"
                    >
                        <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                    </svg>
                    <input
                        ref={searchRef}
                        type="text"
                        className="w-full pl-9 pr-4 py-2 text-[13px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all shadow-sm"
                        placeholder={searchInputPlaceholder}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            </div>

            {/* Pinned rows stay visible (e.g. “+ Add New”); main options scroll */}
            {pinned.length > 0 && (
                <div className="border-b border-slate-100/80 dark:border-slate-800/80 px-1 py-1 shrink-0 bg-white/80 dark:bg-slate-900/80">
                    {pinned.map((option: Option, idx: number) => {
                        const isHighlighted = idx === highlightIndex;
                        const isSelected = option.value === value;
                        return (
                            <div
                                key={`pinned-${option.value}-${idx}`}
                                className={`cursor-pointer border-l-[3px] px-4 py-3 transition-colors border-l-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 ${isHighlighted || isSelected
                                    ? "bg-indigo-50/80 dark:bg-indigo-900/40"
                                    : "hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                    }`}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    onChange(option.value);
                                    close();
                                }}
                                onMouseEnter={() => setHighlightIndex(idx)}
                            >
                                <div className={`text-sm font-semibold ${isSelected ? "text-indigo-600 dark:text-indigo-400" : "text-slate-800 dark:text-slate-100"}`}>
                                    {option.label}
                                </div>
                                {option.sublabel && (
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                                        {option.sublabel}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Scrollable options (excluding pinned — already shown above) */}
            <div className="max-h-60 overflow-y-auto py-1">
                {filteredMainOptions.length === 0 ? (
                    search.trim() || pinned.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-slate-400 text-center italic">No results found</div>
                    ) : null
                ) : (
                    filteredMainOptions.map((option: Option, i: number) => {
                        const idx = pinned.length + i;
                        const isHighlighted = idx === highlightIndex;
                        const isSelected = option.value === value;
                        return (
                            <div
                                key={`${option.value}-${idx}`}
                                className={`cursor-pointer border-l-[3px] px-4 py-3 transition-colors border-l-transparent ${isHighlighted || isSelected
                                    ? "bg-indigo-50/80 dark:bg-indigo-900/40"
                                    : "hover:bg-slate-50/50 dark:hover:bg-slate-800/40"
                                    }`}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    onChange(option.value);
                                    close();
                                }}
                                onMouseEnter={() => setHighlightIndex(idx)}
                            >
                                <div className={`text-sm font-semibold ${isSelected ? "text-indigo-600 dark:text-indigo-400" : "text-slate-800 dark:text-slate-100"}`}>
                                    {option.label}
                                </div>
                                {option.sublabel && (
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                                        {option.sublabel}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );

    return (
        <div className={`relative ${className}`} ref={wrapperRef} onKeyDown={handleKeyDown}>
            {/* Trigger */}
            <div
                ref={triggerRef}
                className={`flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm transition-all min-h-[2.25rem] px-3 py-2 text-sm ${triggerClassName} ${disabled
                    ? "cursor-not-allowed bg-slate-50 dark:bg-slate-800/50 opacity-60"
                    : "cursor-pointer hover:border-indigo-400 hover:ring-2 hover:ring-indigo-400/10 focus:ring-2 focus:ring-indigo-400/20"
                    } ${isOpen ? "ring-2 ring-indigo-400/20 border-indigo-400" : ""}`}
                onClick={isOpen ? close : open}
                tabIndex={disabled ? -1 : 0}
            >
                <div className="flex flex-col truncate min-w-0 flex-1">
                    <span className={`truncate text-sm font-medium leading-snug ${selectedOption ? "text-slate-800 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}`}>
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                    {selectedOption?.sublabel && (
                        <span className="text-[10px] text-slate-400 truncate leading-tight">
                            {selectedOption.sublabel}
                        </span>
                    )}
                </div>
                <svg
                    viewBox="0 0 20 20" fill="currentColor"
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180 text-indigo-500" : ""}`}
                >
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
            </div>

            {/* Portal dropdown */}
            {typeof window !== "undefined" && dropdown
                ? createPortal(dropdown, document.body)
                : null}
        </div>
    );
}
