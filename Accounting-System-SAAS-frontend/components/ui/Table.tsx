import * as React from "react";

export const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className = "", ...props }, ref) => (
  <div className="relative w-full overflow-x-auto">
    <table
      ref={ref}
      className={`w-full border-collapse text-sm text-slate-800 ${className}`.trim()}
      {...props}
    />
  </div>
));

Table.displayName = "Table";

export const THead = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className = "", ...props }, ref) => (
  <thead
    ref={ref}
    className={`sticky top-0 z-10 bg-slate-50 text-xs text-slate-600 ${className}`.trim()}
    {...props}
  />
));

THead.displayName = "THead";

export const TBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className = "", ...props }, ref) => (
  <tbody
    ref={ref}
    className={`divide-y divide-slate-200 ${className}`.trim()}
    {...props}
  />
));

TBody.displayName = "TBody";

export const TR = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className = "", ...props }, ref) => (
  <tr
    ref={ref}
    className={`hover:bg-slate-50 transition-colors ${className}`.trim()}
    {...props}
  />
));

TR.displayName = "TR";

export const TH = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className = "", ...props }, ref) => (
  <th
    ref={ref}
    className={`border-b border-slate-200 px-3 py-2 text-left font-medium text-xs text-slate-600 ${className}`.trim()}
    {...props}
  />
));

TH.displayName = "TH";

export const TD = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className = "", ...props }, ref) => (
  <td
    ref={ref}
    className={`px-3 py-1.5 align-middle text-xs text-slate-800 ${className}`.trim()}
    {...props}
  />
));

TD.displayName = "TD";
