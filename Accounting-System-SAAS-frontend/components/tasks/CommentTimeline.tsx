"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { ReactionsBar } from "@/components/tasks/ReactionsBar";
import type { Comment, Reaction } from "@/types/task";

type CommentEntry = { comment: Comment; reactions: Reaction[] };

type PendingComment = {
  id: string;
  body: string;
  created_at: string;
};

export function CommentTimeline({
  comments,
  canComment,
  onAddComment,
  pending,
  onToggleReaction,
}: {
  comments: CommentEntry[];
  canComment: boolean;
  onAddComment: (body: string) => void;
  pending: PendingComment[];
  onToggleReaction: (commentId: number, emoji: string) => void;
}) {
  const [body, setBody] = React.useState("");

  return (
    <div className="rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Comments</div>
      </div>

      <div className="space-y-3">
        {pending.map((p) => (
          <div
            key={p.id}
            className="rounded-lg border border-border-light dark:border-border-dark bg-white/70 dark:bg-slate-950/30 p-3"
          >
            <div className="text-[11px] text-slate-500">Posting…</div>
            <div className="mt-1 text-sm text-slate-900 dark:text-slate-100">{p.body}</div>
          </div>
        ))}

        {comments.map((c) => (
          <div
            key={c.comment.id}
            className="rounded-lg border border-border-light dark:border-border-dark bg-white/70 dark:bg-slate-950/30 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
                {c.comment.author_name}
              </div>
              <div className="text-[11px] text-slate-500">{c.comment.created_at}</div>
            </div>
            <div className="mt-2 text-sm text-slate-900 dark:text-slate-100 whitespace-pre-wrap">
              {c.comment.body}
            </div>
            <div className="mt-2">
              <ReactionsBar
                reactions={c.reactions}
                disabled={!canComment}
                onToggle={(emoji) => onToggleReaction(c.comment.id, emoji)}
              />
            </div>
          </div>
        ))}

        {!comments.length && !pending.length ? (
          <div className="text-sm text-slate-600 dark:text-slate-300">No comments yet.</div>
        ) : null}
      </div>

      <div className="mt-4">
        {!canComment ? (
          <div className="mb-2 text-xs text-slate-500">
            You don’t have permission to comment on this task.
          </div>
        ) : null}
        <textarea
          value={body}
          disabled={!canComment}
          onChange={(e) => setBody(e.target.value)}
          className="w-full min-h-[90px] rounded-md border border-border-light dark:border-border-dark bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-60"
          placeholder={canComment ? "Write a comment…" : "Commenting disabled"}
        />
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!canComment}
            onClick={() => {
              const trimmed = body.trim();
              if (!trimmed) return;
              onAddComment(trimmed);
              setBody("");
            }}
          >
            Add comment
          </Button>
        </div>
      </div>
    </div>
  );
}

export function makePendingComment(body: string): PendingComment {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    body,
    created_at: new Date().toISOString(),
  };
}
