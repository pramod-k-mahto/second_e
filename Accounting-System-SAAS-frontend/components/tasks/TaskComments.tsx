"use client";

import * as React from "react";
import type { TaskDetailResponse } from "@/lib/tasks/types";
import { CommentTimeline, makePendingComment } from "@/components/tasks/CommentTimeline";

export function TaskComments({
  comments,
  canComment,
  onAddComment,
  onToggleReaction,
}: {
  comments: TaskDetailResponse["comments"];
  canComment: boolean;
  onAddComment: (body: string) => Promise<void> | void;
  onToggleReaction: (commentId: number, emoji: string) => Promise<void> | void;
}) {
  const [pending, setPending] = React.useState<ReturnType<typeof makePendingComment>[]>([]);

  return (
    <CommentTimeline
      comments={comments as any}
      canComment={canComment}
      pending={pending}
      onAddComment={async (body) => {
        const p = makePendingComment(body);
        setPending((prev) => [...prev, p]);
        try {
          await onAddComment(body);
        } finally {
          setPending((prev) => prev.filter((x) => x.id !== p.id));
        }
      }}
      onToggleReaction={(commentId, emoji) => onToggleReaction(commentId, emoji)}
    />
  );
}
