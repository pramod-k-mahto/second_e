"use client";

import * as React from "react";
import type { Assignee, TaskDetailResponse, TaskStatus, TenantUser, CollaboratorRole } from "@/lib/tasks/types";
import { TaskDetailHeader } from "@/components/tasks/TaskDetailHeader";
import { ReactionsBar } from "@/components/tasks/ReactionsBar";
import { TaskCollaborators } from "@/components/tasks/TaskCollaborators";
import { TaskAttachments } from "@/components/tasks/TaskAttachments";
import { TaskChecklist } from "@/components/tasks/TaskChecklist";
import { TaskComments } from "@/components/tasks/TaskComments";
import { LogInteractionModal } from "@/components/tasks/LogInteractionModal";
import { useParams } from "next/navigation";
import { Calendar, MessageSquare, Plus } from "lucide-react";
import { Card } from "@/components/ui/Card";

type TaskDetailTab = "details" | "attachments" | "checklist" | "comments" | "interactions";

export function TaskDetail({
  data,
  tenantUsers,
  canVerify,
  canManageAssignments,
  onStatus,
  onProgress,
  onAssign: _onAssign,
  onAssigneesAdd,
  onAssigneeRemove,
  onAssigneeRoleUpdate,
  onUpload,
  onDeleteAttachment,
  onChecklistAdd,
  onChecklistToggle,
  onChecklistDelete,
  onAddComment,
  onToggleTaskReaction,
  onToggleCommentReaction,
  onForward,
  deletingAttachmentIds,
  busyChecklistIds,
}: {
  data: TaskDetailResponse;
  tenantUsers: TenantUser[];
  canVerify?: boolean;
  canManageAssignments?: boolean;
  onStatus: (next: TaskStatus) => void;
  onProgress: (next: number) => void;
  onAssign: (assigneeId: number | null) => void;
  onAssigneesAdd: (userIds: number[], role: CollaboratorRole) => void;
  onAssigneeRemove: (userId: number) => void;
  onAssigneeRoleUpdate?: (userId: number, role: CollaboratorRole) => void;
  onUpload: (files: File[]) => Promise<void> | void;
  onDeleteAttachment: (attachmentId: number) => Promise<void> | void;
  onChecklistAdd: (text: string) => void;
  onChecklistToggle: (itemId: number, nextDone: boolean) => void;
  onChecklistDelete: (itemId: number) => void;
  onAddComment: (body: string) => Promise<void> | void;
  onToggleTaskReaction: (emoji: string) => void;
  onToggleCommentReaction: (commentId: number, emoji: string) => void;
  onForward?: (userId: number) => void;
  deletingAttachmentIds?: Set<number>;
  busyChecklistIds?: Set<number>;
}) {
  void _onAssign;
  const { task, permissions } = data;
  const reactionsAllowed = permissions.can_comment || permissions.can_update;

  const [activeTab, setActiveTab] = React.useState<TaskDetailTab>("details");
  const [forwardModalOpen, setForwardModalOpen] = React.useState(false);
  const [forwardSearch, setForwardSearch] = React.useState("");
  const [logModalOpen, setLogModalOpen] = React.useState(false);
  const params = useParams();
  const companyId = params.companyId as string;

  const effectiveAssignees = React.useMemo(() => {
    if (Array.isArray((data as any).collaborators) && (data as any).collaborators.length) {
      return (data as any).collaborators as Assignee[];
    }
    if (Array.isArray((data as any).assignees) && (data as any).assignees.length) {
      return (data as any).assignees as Assignee[];
    }
    if (Array.isArray(task.assignees) && task.assignees.length) {
      return task.assignees as Assignee[];
    }
    if (task.assignee_id) {
      return [{ id: task.assignee_id, name: task.assignee_name || null }] as Assignee[];
    }
    return [] as Assignee[];
  }, [data, task.assignee_id, task.assignee_name, task.assignees]);

  return (
    <div className="space-y-4">
      <TaskDetailHeader
        task={task as any}
        canUpdate={permissions.can_update && !canVerify}
        canVerify={canVerify}
        onStatus={onStatus}
        onProgress={onProgress}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("details")}
          className={[
            "rounded-full border px-4 py-1.5 text-xs font-medium transition-colors",
            activeTab === "details"
              ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 shadow-sm"
              : "border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800",
          ].join(" ")}
        >
          Details
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("attachments")}
          className={[
            "rounded-full border px-4 py-1.5 text-xs font-medium transition-colors",
            activeTab === "attachments"
              ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 shadow-sm"
              : "border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800",
          ].join(" ")}
        >
          Attachments ({data.attachments?.length || 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("checklist")}
          className={[
            "rounded-full border px-4 py-1.5 text-xs font-medium transition-colors",
            activeTab === "checklist"
              ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 shadow-sm"
              : "border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800",
          ].join(" ")}
        >
          Checklist ({data.checklist?.length || 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("interactions")}
          className={[
            "rounded-full border px-4 py-1.5 text-xs font-medium transition-colors",
            activeTab === "interactions"
              ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 shadow-sm"
              : "border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800",
          ].join(" ")}
        >
          Interactions ({(data as any).interactions?.length || 0})
        </button>
      </div>

      {activeTab === "details" ? (
        <>
          <TaskCollaborators
            collaborators={effectiveAssignees}
            users={tenantUsers}
            canEdit={Boolean(canManageAssignments) && permissions.can_assign}
            onAdd={onAssigneesAdd}
            onRemove={onAssigneeRemove}
            onUpdateRole={onAssigneeRoleUpdate || (() => {})}
          />

          <div className="rounded-lg border border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/30 dark:bg-indigo-900/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Task Forwarding</div>
                <div className="text-xs text-slate-500 mt-0.5">Transfer this task to another team member.</div>
              </div>
              <button
                type="button"
                onClick={() => setForwardModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all active:scale-95"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Forward
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Reactions</div>
            </div>
            <ReactionsBar
              reactions={data.reactions as any}
              disabled={!reactionsAllowed}
              onToggle={onToggleTaskReaction}
            />
          </div>

          {task.customer_id && (
            <div className="rounded-lg border border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/30 dark:bg-indigo-900/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Customer Interaction</div>
                  <div className="text-xs text-slate-500 mt-0.5">Log a new communication for {task.customer_name || "this customer"}.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setLogModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all active:scale-95"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Log Interaction
                </button>
              </div>
            </div>
          )}
        </>
      ) : null}

      {activeTab === "attachments" ? (
        <TaskAttachments
          attachments={data.attachments}
          canUpload={permissions.can_upload}
          deletingIds={deletingAttachmentIds}
          onUpload={onUpload}
          onDelete={(a) => onDeleteAttachment(a.id)}
        />
      ) : null}

      {activeTab === "checklist" ? (
        <TaskChecklist
          items={data.checklist}
          canEdit={permissions.can_update}
          busyIds={busyChecklistIds}
          onAdd={onChecklistAdd}
          onToggle={(item, nextDone) => onChecklistToggle(item.id, nextDone)}
          onDelete={(item) => onChecklistDelete(item.id)}
        />
      ) : null}

      {activeTab === "comments" ? (
        <TaskComments
          comments={data.comments}
          canComment={permissions.can_comment}
          onAddComment={onAddComment}
          onToggleReaction={onToggleCommentReaction}
        />
      ) : null}

      {activeTab === "interactions" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Communication History</h3>
            {task.customer_id && (
              <button
                onClick={() => setLogModalOpen(true)}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 underline"
              >
                Log New
              </button>
            )}
          </div>
          
          {!(data as any).interactions?.length ? (
            <div className="text-center py-12 bg-slate-50/50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
              <MessageSquare className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-500">No interactions logged for this task yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(data as any).interactions.map((log: any) => (
                <Card key={log.id} className="p-4 bg-white dark:bg-slate-900 hover:border-indigo-200 transition-colors">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-indigo-50 dark:bg-indigo-900/30 rounded text-indigo-600 dark:text-indigo-400">
                        <MessageSquare className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-tighter">
                        {log.interaction_type}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      <Calendar className="h-3 w-3" />
                      {new Date(log.interaction_date).toLocaleDateString()}
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed truncate-2-lines italic">
                    &quot;{log.notes}&quot;
                  </p>
                  <div className="mt-3 text-[11px] text-slate-500 flex items-center gap-1 justify-end">
                    <span>Logged by</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{log.employee_name}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div
        className={[
          "fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 transition-opacity",
          forwardModalOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        ].join(" ")}
      >
        <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
           <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-slate-100">Forward Task</h3>
              <button onClick={() => setForwardModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
           </div>
           
           <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Select Team Member</label>
                <input 
                  type="text" 
                  placeholder="Search by name or email..."
                  value={forwardSearch}
                  onChange={(e) => setForwardSearch(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>

              <div className="max-h-60 overflow-y-auto pr-1 space-y-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                {tenantUsers
                  .filter(u => 
                    u.active && 
                    (u.name?.toLowerCase().includes(forwardSearch.toLowerCase()) || 
                     u.email?.toLowerCase().includes(forwardSearch.toLowerCase()))
                  )
                  .map(u => (
                    <button
                      key={u.id}
                      onClick={() => {
                        if (onForward) onForward(u.id);
                        setForwardModalOpen(false);
                      }}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                    >
                      <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-xs">
                        {u.name?.charAt(0) || u.email.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{u.name || "Unnamed"}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{u.email}</div>
                      </div>
                    </button>
                  ))
                }
              </div>
           </div>
        </div>
      </div>

      {task.customer_id && (
        <LogInteractionModal
          isOpen={logModalOpen}
          onClose={() => setLogModalOpen(false)}
          companyId={companyId}
          customerId={task.customer_id}
          customerName={task.customer_name || undefined}
          taskId={task.id}
          employeeId={tenantUsers[0]?.id || 0}
          employees={tenantUsers}
        />
      )}
    </div>
  );
}
