"use client";

import * as React from "react";
import type { Reaction } from "@/types/task";

const DEFAULT_EMOJIS = ["👍", "🎉", "❤️", "😄", "😮", "😢"];

export function ReactionsBar({
  reactions,
  onToggle,
  disabled,
}: {
  reactions: Reaction[];
  onToggle: (emoji: string) => void;
  disabled?: boolean;
}) {
  const present = reactions || [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {present.map((r) => (
        <button
          key={r.emoji}
          type="button"
          disabled={disabled}
          onClick={() => onToggle(r.emoji)}
          className={[
            "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors",
            r.reacted_by_me
              ? "border-brand-500 bg-brand-50 text-brand-800"
              : "border-border-light dark:border-border-dark bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800",
            disabled ? "opacity-60 cursor-not-allowed" : "",
          ].join(" ")}
        >
          <span>{r.emoji}</span>
          <span className="text-[11px]">{r.count}</span>
        </button>
      ))}

      <div className="ml-1 flex items-center gap-1">
        {DEFAULT_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(e)}
            className={[
              "rounded-full border border-border-light dark:border-border-dark bg-white dark:bg-slate-900 px-2 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800",
              disabled ? "opacity-60 cursor-not-allowed" : "",
            ].join(" ")}
            aria-label={`React ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
