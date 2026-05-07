import * as React from "react";

interface ModalProps {
  open: boolean;
  title?: string;
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
  headerActions?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
}

export function Modal({ open, title, children, onClose, className = "", headerActions, size = "md" }: ModalProps) {
  if (!open) return null;

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && onClose) onClose();
  };


  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-[95vw]",
  };

  return (
    <div
      className="fixed inset-0 z-[200000] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div
        className={`w-full ${sizeClasses[size]} rounded-lg bg-white p-4 text-sm shadow-2xl ${className}`.trim()}
      >

        <div className="mb-3 flex items-center justify-start gap-4 border-b border-slate-100 pb-2 no-print">
          {title && <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight">{title}</h2>}
          <div className="flex items-center gap-3">
            {headerActions}
          </div>
          {!headerActions && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="ml-auto text-xs font-bold text-slate-400 hover:text-rose-500 transition-colors uppercase tracking-wider"
            >
              Close
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

