"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Layout, 
  Search,
  CheckCircle2
} from "lucide-react";
import { 
  useTaskHeads, 
  useCreateTaskHead, 
  useUpdateTaskHead, 
  useDeleteTaskHead 
} from "@/lib/tasks/queries";
import { TaskHead } from "@/lib/tasks/types";

export default function TaskHeadsPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  
  const { data: heads, isLoading } = useTaskHeads(parseInt(companyId));
  const createMutation = useCreateTaskHead(parseInt(companyId));
  const updateMutation = useUpdateTaskHead(parseInt(companyId));
  const deleteMutation = useDeleteTaskHead(parseInt(companyId));

  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingHead, setEditingHead] = useState<TaskHead | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "" });

  const handleOpenCreate = () => {
    setEditingHead(null);
    setFormData({ name: "", description: "" });
    setShowForm(true);
  };

  const handleOpenEdit = (head: TaskHead) => {
    setEditingHead(head);
    setFormData({ name: head.name, description: head.description || "" });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingHead) {
      await updateMutation.mutateAsync({ 
        headId: editingHead.id, 
        payload: { name: formData.name, description: formData.description } 
      });
    } else {
      await createMutation.mutateAsync(formData);
    }
    setShowForm(false);
    setFormData({ name: "", description: "" });
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this task head?")) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const filteredHeads = heads?.filter(h => 
    h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    h.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader 
        title="Task Heads" 
        subtitle="Manage task categories and classification levels for better organization."
        closeLink={`/companies/${companyId}/tasks`}
        actions={
          <Button onClick={handleOpenCreate} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700">
            <Plus className="h-4 w-4" />
            New Task Head
          </Button>
        }
      />

      <div className="flex items-center gap-4 bg-white p-4 rounded-lg shadow-sm border border-slate-200">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input 
            placeholder="Search task heads..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {showForm && (
        <Card className="p-6 border-indigo-200 bg-indigo-50/30">
          <form onSubmit={handleSubmit} className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-800">
              {editingHead ? "Edit Task Head" : "Create New Task Head"}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField 
                label="Name"
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="e.g. Sales Follow-up"
                required
              />
              <FormField 
                label="Description"
                value={formData.description} 
                onChange={e => setFormData({...formData, description: e.target.value})}
                placeholder="Optional categorization details"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {editingHead ? "Update Head" : "Create Head"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-slate-500">Loading task heads...</div>
      ) : filteredHeads?.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
          <Layout className="h-12 w-12 text-slate-200 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-500">No task heads found</h3>
          <p className="text-slate-400 mt-1">Start by creating categories for your company tasks.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredHeads?.map((head) => (
            <Card key={head.id} className="p-4 hover:border-indigo-200 transition-colors group relative border-slate-200">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 rounded-lg border border-indigo-100 dark:bg-indigo-900/20">
                    <Layout className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">{head.name}</h4>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{head.description || "No description"}</p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleOpenEdit(head)}
                    className="h-8 w-8 p-0 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleDelete(head.id)}
                    className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Level category
                </span>
                <span>Created {new Date(head.created_at).toLocaleDateString()}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
