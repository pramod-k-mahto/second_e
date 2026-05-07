"use client";

import * as React from "react";

interface DrawerProps {
  open: boolean;
  title?: string;
  side?: "right" | "left";
  widthClassName?: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export function Drawer({
  open,
  title,
  side = "right",
  widthClassName = "max-w-md w-full",
  onClose,
  children,
  className = "",
}: DrawerProps) {
  if (!open) return null;

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const sideClasses =
    side === "right"
      ? "right-0 translate-x-0"
      : "left-0 translate-x-0";

  return (
    <div
      className="fixed inset-0 z-40 flex bg-black/40"
      onClick={handleBackdrop}
    >
      <div
        className={[
          "relative ml-auto flex h-full flex-col bg-white dark:bg-slate-900 shadow-xl border-l border-border-light dark:border-border-dark transition-transform",
          sideClasses,
          widthClassName,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="flex items-center justify-between border-b border-border-light dark:border-border-dark px-4 py-3 text-sm">
          {title && (
            <h2 className="font-medium text-slate-900 dark:text-slate-100">
              {title}
            </h2>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 text-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
