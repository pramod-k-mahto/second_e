"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { api } from "@/lib/api";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import { safeADToBS, safeBSToAD, addDaysAD, addDaysBS } from "@/lib/bsad";

import { useCalendarSettings } from "@/components/CalendarSettingsContext";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  forceNative?: boolean;
  calendarMode?: "AD" | "BS";
  alignRight?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", type, forceNative, calendarMode, alignRight, ...props }, ref) => {
    const { calendarMode: companyCalendarMode, reportMode: companyReportMode } = useCalendarSettings();

    const isBS = calendarMode ? calendarMode === "BS" : (companyCalendarMode === "BS");

    const [localValue, setLocalValue] = React.useState<string>(() => {
      if (type !== "date") return "";
      const val = props.value as string || "";
      if (isBS) {
        // If it's already a valid BS date or can be converted from AD
        return safeADToBS(val) || val;
      }
      return val;
    });

    React.useEffect(() => {
      if (type === "date") {
        const val = props.value as string || "";
        setLocalValue(isBS ? (safeADToBS(val) || val) : val);
      }
    }, [props.value, isBS, type]);

    const baseClasses =
      "flex h-10 w-full rounded-md border border-slate-400/60 dark:border-slate-600/60 bg-white/50 dark:bg-slate-900/50 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 shadow-sm transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800";

    const mergedClassName = `${baseClasses} ${className}`.trim();

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (type === "date") {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const delta = e.key === "ArrowUp" ? 1 : -1;
          let currentVal = localValue;
          if (!currentVal && props.value) {
             currentVal = isBS ? safeADToBS(props.value as string) : (props.value as string);
          }
          
          if (currentVal) {
            const newVal = isBS ? addDaysBS(currentVal, delta) : addDaysAD(currentVal, delta);
            setLocalValue(newVal);
            
            // Trigger formal onChange
            if (props.onChange) {
               const finalVal = isBS ? safeBSToAD(newVal) : newVal;
               const event = {
                 target: { value: finalVal, name: props.name || "" },
                 currentTarget: { value: finalVal, name: props.name || "" }
               } as unknown as React.ChangeEvent<HTMLInputElement>;
               props.onChange(event);
            }
          }
        }
      }
      if (props.onKeyDown) props.onKeyDown(e);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (type === "date") {
        let val = e.target.value;
        const digits = val.replace(/\D/g, "");
        if (digits.length <= 8) {
          if (digits.length > 6) {
            val = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
          } else if (digits.length > 4) {
            val = `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
          } else {
            val = digits;
          }
        }
        setLocalValue(val);

        // Only trigger parent onChange if we have a full date
        if (val.length === 10) {
          const finalVal = isBS ? safeBSToAD(val) : val;
          if (props.onChange) {
            const event = {
              target: { value: finalVal, name: props.name || "" },
              currentTarget: { value: finalVal, name: props.name || "" }
            } as unknown as React.ChangeEvent<HTMLInputElement>;
            props.onChange(event);
          }
        }
      } else {
        if (props.onChange) props.onChange(e);
      }
    };

    // Date-specific implementation
    const inputId = React.useId();
    if (type === "date" && !forceNative) {
      return (
        <div className="relative group/date-input w-full z-[30] focus-within:z-[100]">
          <input
            {...props}
            type="text"
            ref={ref}
            readOnly={false}
            autoComplete="off"
            value={localValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            className={`${baseClasses} pr-10 ${className}`.trim()}
            placeholder="YYYY-MM-DD"
          />

          {/* Hidden Date Picker Overlays (Optimized Layout) */}
          <div className="absolute right-2 top-1 w-8 h-8 z-20 pointer-events-auto">
            {isBS ? (
               <div className={`nepali-date-picker w-full h-full relative z-[60] ${alignRight ? 'align-right' : ''}`}>
                 <NepaliDatePicker
                    value={localValue}
                    onChange={(bs: string) => {
                      setLocalValue(bs);
                      const ad = safeBSToAD(bs) || "";
                      if (props.onChange) {
                        const event = {
                          target: { value: ad, name: props.name || "" },
                          currentTarget: { value: ad, name: props.name || "" },
                        } as unknown as React.ChangeEvent<HTMLInputElement>;
                        props.onChange(event);
                      }
                    }}
                    options={{ calenderLocale: "ne", valueLocale: "en" }}
                    inputClassName="w-full h-full cursor-pointer p-0 border-none bg-transparent opacity-0"
                    // @ts-ignore
                    minDate={props.min ? (safeADToBS(props.min as string) || undefined) : undefined}
                    // @ts-ignore
                    maxDate={props.max ? (safeADToBS(props.max as string) || undefined) : undefined}
                  />
               </div>
            ) : (
              <input
                id={`picker-ad-${inputId}`}
                type="date"
                className="w-full h-full cursor-pointer opacity-0"
                value={localValue}
                min={props.min}
                max={props.max}
                onChange={(e) => {
                  const val = e.target.value;
                  setLocalValue(val);
                  if (props.onChange) props.onChange(e);
                }}
              />
            )}
          </div>

          <div className="absolute right-0 top-0 bottom-0 flex items-center pr-2">
            <div 
              className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer group/date-icon"
              onClick={(e) => {
                // For native AD picker, we need showPicker() or click()
                if (!isBS) {
                   const pickerInput = document.getElementById(`picker-ad-${inputId}`) as HTMLInputElement;
                   if (pickerInput) {
                      try {
                        // @ts-ignore
                        if (pickerInput.showPicker) pickerInput.showPicker();
                        else pickerInput.click();
                      } catch (err) {
                        pickerInput.click();
                      }
                   }
                }
                // For BS, the NepaliDatePicker overlay will receive the click directly
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500 relative z-10 pointer-events-none group-hover/date-icon:text-indigo-500 transition-colors"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            </div>
          </div>
        </div>
      );
    }

    return (
      <input
        ref={ref}
        type={type}
        className={mergedClassName}
        {...props}
        onChange={type === "date" ? handleInputChange : props.onChange}
        onKeyDown={type === "date" ? handleKeyDown : props.onKeyDown}
      />
    );
  }
);

Input.displayName = "Input";
