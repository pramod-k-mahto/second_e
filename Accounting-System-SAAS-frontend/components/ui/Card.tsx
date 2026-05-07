import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`bg-surface-light dark:bg-slate-900 shadow-sm rounded-lg border border-border-light dark:border-border-dark p-4 md:p-5 ${className}`}
    >
      {children}
    </div>
  );
}
