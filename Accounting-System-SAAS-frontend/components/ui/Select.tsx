import * as React from "react";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = "", children, ...props }, ref) => {
    const baseClasses =
      "flex h-10 w-full rounded-md border border-slate-400/60 dark:border-slate-600/60 bg-white/50 dark:bg-slate-900/50 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800";

    return (
      <select
        ref={ref}
        className={`${baseClasses} ${className}`.trim()}
        {...props}
      >
        {children}
      </select>
    );
  }
);

Select.displayName = "Select";
