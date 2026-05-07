"use client";

import React from 'react';
import { useCalendarSettings } from '@/components/CalendarSettingsContext';
import { safeADToBS } from '@/lib/bsad';

interface FormattedDateProps {
  /** ISO Date string (YYYY-MM-DD) or any date string parsable by JS */
  date: string | null | undefined;
  /** Optional override for display mode */
  mode?: 'AD' | 'BS' | 'BOTH';
  /** Optional className for the span */
  className?: string;
  /** If true, shows a skeleton while loading settings */
  showLoading?: boolean;
  /** If true, appends (AD) or (BS) suffix */
  showSuffix?: boolean;
}

export function FormattedDate({ 
  date, 
  mode, 
  className = "", 
  showLoading = true,
  showSuffix = false
}: FormattedDateProps) {
  const { displayMode, isLoading } = useCalendarSettings();

  if (isLoading && showLoading) {
    return <span className={`animate-pulse bg-slate-200 rounded h-4 w-20 inline-block ${className}`} />;
  }

  if (!date) return <span className={className}>-</span>;

  // Ensure date is in YYYY-MM-DD format for processing if it's a full ISO string
  const normalizedDate = date.includes('T') ? date.split('T')[0] : date;
  
  const effectiveMode = mode || displayMode;

  const ad = normalizedDate;
  const bs = safeADToBS(normalizedDate) || 'Invalid BS';

  if (effectiveMode === 'BS') {
    return <span className={className}>{bs}{showSuffix ? ' (BS)' : ''}</span>;
  }

  if (effectiveMode === 'BOTH') {
    return (
      <span className={className}>
        {bs} <span className="text-slate-400 text-[0.9em]">({ad})</span>
      </span>
    );
  }

  // Default to AD
  return <span className={className}>{ad}{showSuffix ? ' (AD)' : ''}</span>;
}
