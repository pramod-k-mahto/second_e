"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

interface CalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Optional future extension:
  // onResult?: (value: number) => void;
}

export const CalculatorModal: React.FC<CalculatorModalProps> = ({ isOpen, onClose }) => {
  const [display, setDisplay] = useState<string>("0");
  const [pendingValue, setPendingValue] = useState<number | null>(null);
  const [pendingOperator, setPendingOperator] = useState<string | null>(null);
  const [waitingForNext, setWaitingForNext] = useState<boolean>(false);

  const resetAll = useCallback(() => {
    setDisplay("0");
    setPendingValue(null);
    setPendingOperator(null);
    setWaitingForNext(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      resetAll();
    }
  }, [isOpen, resetAll]);

  const expressionLabel = useMemo(() => {
    if (pendingValue == null || !pendingOperator) return "";
    if (waitingForNext) {
      return `${pendingValue} ${pendingOperator}`;
    }
    return `${pendingValue} ${pendingOperator} ${display}`;
  }, [pendingValue, pendingOperator, waitingForNext, display]);

  const inputDigit = (digit: string) => {
    setDisplay((prev) => {
      if (waitingForNext) {
        setWaitingForNext(false);
        return digit;
      }
      if (prev === "0") return digit;
      return prev + digit;
    });
  };

  const inputDot = () => {
    setDisplay((prev) => {
      if (waitingForNext) {
        setWaitingForNext(false);
        return "0.";
      }
      if (prev.includes(".")) return prev;
      return prev + ".";
    });
  };

  const toggleSign = () => {
    setDisplay((prev) => {
      if (prev === "0") return prev;
      return prev.startsWith("-") ? prev.slice(1) : "-" + prev;
    });
  };

  const inputPercent = () => {
    setDisplay((prev) => {
      const value = parseFloat(prev || "0");
      if (Number.isNaN(value)) return "0";
      return String(value / 100);
    });
  };

  const performCalculation = (a: number, b: number, operator: string): number | "Error" => {
    if (operator === "+") return a + b;
    if (operator === "-") return a - b;
    if (operator === "×" || operator === "*") return a * b;
    if (operator === "÷" || operator === "/") {
      if (b === 0) return "Error";
      return a / b;
    }
    return b;
  };

  const handleOperator = (nextOperator: string) => {
    const inputValue = parseFloat(display || "0");
    if (Number.isNaN(inputValue)) {
      resetAll();
      setDisplay("Error");
      return;
    }

    if (pendingValue == null) {
      setPendingValue(inputValue);
    } else if (pendingOperator) {
      const result = performCalculation(pendingValue, inputValue, pendingOperator);
      if (result === "Error") {
        setDisplay("Error");
        setPendingValue(null);
        setPendingOperator(null);
        setWaitingForNext(true);
        return;
      }
      setPendingValue(result);
      setDisplay(String(result));
    }

    setPendingOperator(nextOperator);
    setWaitingForNext(true);
  };

  const handleEquals = () => {
    const inputValue = parseFloat(display || "0");
    if (Number.isNaN(inputValue)) {
      resetAll();
      setDisplay("Error");
      return;
    }

    if (pendingValue != null && pendingOperator) {
      const result = performCalculation(pendingValue, inputValue, pendingOperator);
      if (result === "Error") {
        setDisplay("Error");
        setPendingValue(null);
        setPendingOperator(null);
        setWaitingForNext(true);
        return;
      }
      setDisplay(String(result));
      setPendingValue(null);
      setPendingOperator(null);
      setWaitingForNext(true);
      // In future, we could call onResult?.(result) here.
    }
  };

  const handleKey = (key: string) => {
    if (key >= "0" && key <= "9") {
      inputDigit(key);
    } else if (key === ".") {
      inputDot();
    } else if (["+", "-", "*", "/"].includes(key)) {
      const mapped = key === "*" ? "×" : key === "/" ? "÷" : key;
      handleOperator(mapped);
    } else if (key === "Enter" || key === "=") {
      handleEquals();
    } else if (key === "Escape") {
      onClose();
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const listener = (e: KeyboardEvent) => {
      handleKey(e.key);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, display, pendingValue, pendingOperator]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl min-h-[460px] sm:min-h-[520px] max-h-[90vh] rounded-3xl bg-slate-900 text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.9)] border border-slate-700/80 px-6 py-7 sm:px-8 sm:py-9 flex flex-col overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Calculator</div>
          <button
            type="button"
            className="text-[11px] px-2.5 py-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 border border-slate-600 text-slate-200 shadow-sm"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="mb-7 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-slate-700 px-4 py-6 sm:px-5 sm:py-7 text-right shadow-inner">
          {expressionLabel && (
            <div className="text-[11px] text-slate-500/80 mb-0.5 tabular-nums truncate">
              {expressionLabel}
            </div>
          )}
          <div className="text-[11px] text-slate-500 tracking-wide">Result</div>
          <div className="mt-1 text-4xl sm:text-5xl font-semibold tabular-nums break-all min-h-[3rem] text-slate-50">
            {display}
          </div>
        </div>

        <div className="border-t border-slate-800/70 pt-5 mt-3 grid grid-cols-4 gap-3 text-lg select-none flex-1">
          <button
            type="button"
            className="col-span-1 rounded-xl bg-slate-900 hover:bg-red-900/70 text-red-300 px-3.5 py-2.5 font-semibold border border-red-800/60"
            onClick={resetAll}
          >
            C
          </button>
          <button
            type="button"
            className="col-span-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 px-3.5 py-2.5 font-semibold"
            onClick={toggleSign}
          >
            +/-
          </button>
          <button
            type="button"
            className="col-span-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 px-3.5 py-2.5 font-semibold"
            onClick={inputPercent}
          >
            %
          </button>
          <button
            type="button"
            className="col-span-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 px-3.5 py-2.5 font-semibold shadow-sm"
            onClick={() => handleOperator("÷")}
          >
            ÷
          </button>

          {(["7", "8", "9"] as const).map((d) => (
            <button
              key={d}
              type="button"
              className="rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-3.5 text-2xl font-medium"
              onClick={() => inputDigit(d)}
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            className="rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 px-3.5 py-3 font-semibold shadow-sm"
            onClick={() => handleOperator("×")}
          >
            ×
          </button>

          {(["4", "5", "6"] as const).map((d) => (
            <button
              key={d}
              type="button"
              className="rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-3.5 text-2xl font-medium"
              onClick={() => inputDigit(d)}
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            className="rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 px-3.5 py-3 font-semibold shadow-sm"
            onClick={() => handleOperator("-")}
          >
            −
          </button>

          {(["1", "2", "3"] as const).map((d) => (
            <button
              key={d}
              type="button"
              className="rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-3.5 text-2xl font-medium"
              onClick={() => inputDigit(d)}
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            className="rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 px-3.5 py-3 font-semibold shadow-sm"
            onClick={() => handleOperator("+")}
          >
            +
          </button>

          <button
            type="button"
            className="col-span-2 rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-3.5 text-2xl font-medium"
            onClick={() => inputDigit("0")}
          >
            0
          </button>
          <button
            type="button"
            className="rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-3.5 text-2xl font-medium"
            onClick={inputDot}
          >
            .
          </button>
          <button
            type="button"
            className="rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-900 px-3.5 py-3 font-semibold shadow-sm"
            onClick={handleEquals}
          >
            =
          </button>
        </div>
      </div>
    </div>
  );
};
