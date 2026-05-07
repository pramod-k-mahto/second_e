"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import useSWR from 'swr';
import { useParams } from 'next/navigation';
import { api, getCurrentCompany } from '@/lib/api';
import { 
  CalendarDisplayMode, 
  readCalendarDisplayMode, 
  writeCalendarDisplayMode,
  CalendarReportDisplayMode,
  readCalendarReportDisplayMode,
  writeCalendarReportDisplayMode 
} from '@/lib/calendarMode';

type CalendarMode = 'AD' | 'BS';

interface CalendarSettingsContextType {
  calendarMode: CalendarMode; // Company-level primary mode
  displayMode: CalendarDisplayMode; // User-level preferred display
  setDisplayMode: (mode: CalendarDisplayMode) => void;
  reportMode: CalendarReportDisplayMode; // Active preference for reports (AD or BS)
  setReportMode: (mode: CalendarReportDisplayMode) => void;
  isLoading: boolean;
}

const CalendarSettingsContext = createContext<CalendarSettingsContextType | undefined>(undefined);

export function CalendarSettingsProvider({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const companyId = (params?.companyId as string | undefined) || getCurrentCompany()?.id?.toString();

  const { data: settings, isLoading } = useSWR(
    companyId ? `/companies/${companyId}/settings` : null,
    (url: string) => api.get(url).then((res) => res.data).catch(() => null)
  );

  const calendarMode: CalendarMode = settings?.calendar_mode || getCurrentCompany()?.calendar_mode || 'AD';
  
  const [displayMode, setDisplayModeState] = useState<CalendarDisplayMode>('AD');
  const [reportMode, setReportModeState] = useState<CalendarReportDisplayMode>('AD');

  // Initialize from localStorage on mount or when companyId/calendarMode changes
  useEffect(() => {
    if (!companyId) return;
    const fallback = calendarMode as CalendarDisplayMode;
    const stored = readCalendarDisplayMode(companyId, fallback);
    setDisplayModeState(stored);

    const reportFallback = (stored === 'BOTH' ? (calendarMode as CalendarReportDisplayMode) : (stored as CalendarReportDisplayMode));
    const reportStored = readCalendarReportDisplayMode(companyId, reportFallback);
    setReportModeState(reportStored);
  }, [companyId, calendarMode]);

  const setDisplayMode = (mode: CalendarDisplayMode) => {
    if (!companyId) return;
    setDisplayModeState(mode);
    writeCalendarDisplayMode(companyId, mode);
    
    // If we switch away from BOTH, update reportMode to match
    if (mode !== 'BOTH') {
      setReportModeState(mode as CalendarReportDisplayMode);
      writeCalendarReportDisplayMode(companyId, mode as CalendarReportDisplayMode);
    }
  };

  const setReportMode = (mode: CalendarReportDisplayMode) => {
    if (!companyId) return;
    setReportModeState(mode);
    writeCalendarReportDisplayMode(companyId, mode);
  };

  const value = useMemo(() => ({
    calendarMode,
    displayMode,
    setDisplayMode,
    reportMode,
    setReportMode,
    isLoading
  }), [calendarMode, displayMode, reportMode, isLoading]);

  return (
    <CalendarSettingsContext.Provider value={value}>
      {children}
    </CalendarSettingsContext.Provider>
  );
}

export function useCalendarSettings() {
  const context = useContext(CalendarSettingsContext);
  if (context === undefined) {
    throw new Error('useCalendarSettings must be used within a CalendarSettingsProvider');
  }
  return context;
}
