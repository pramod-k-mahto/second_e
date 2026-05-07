"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface ManageLookupsModalProps {
  open: boolean;
  onClose: () => void;
  onUpdate: (type: "STATUS" | "PRIORITY" | "SUPERVISOR" | "OPERATOR" | "MACHINE" | "STAGE" | "ROLE_PRESET", items: any) => void;
  initialStatuses: string[];
  initialPriorities: string[];
  initialSupervisors: string[];
  initialOperators: string[];
  initialMachines: string[];
  initialStages: string[];
  initialRolePresets: Record<string, Record<string, string>>;
}

export function ManageLookupsModal({
  open,
  onClose,
  onUpdate,
  initialStatuses,
  initialPriorities,
  initialSupervisors,
  initialOperators,
  initialMachines,
  initialStages,
  initialRolePresets,
}: ManageLookupsModalProps) {
  const [tab, setTab] = useState<"STATUS" | "PRIORITY" | "SUPERVISOR" | "OPERATOR" | "MACHINE" | "STAGE" | "ROLE_PRESET">("STATUS");
  const [items, setItems] = useState<string[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newValue, setNewValue] = useState("");

  useEffect(() => {
    if (open) {
      if (tab === "STATUS") setItems(initialStatuses);
      else if (tab === "PRIORITY") setItems(initialPriorities);
      else if (tab === "SUPERVISOR") setItems(initialSupervisors);
      else if (tab === "OPERATOR") setItems(initialOperators);
      else if (tab === "MACHINE") setItems(initialMachines);
      else if (tab === "STAGE") setItems(initialStages);
      else setItems(Object.keys(initialRolePresets));
    }
  }, [open, tab, initialStatuses, initialPriorities, initialSupervisors, initialOperators, initialMachines, initialStages, initialRolePresets]);

  const handleAdd = () => {
    if (!newValue.trim()) return;
    const isText = ["SUPERVISOR", "OPERATOR", "MACHINE", "STAGE"].includes(tab);
    const v = isText ? newValue.trim() : newValue.trim().toUpperCase();
    if (!items.includes(v)) {
      if (tab === "ROLE_PRESET") {
        const updated = { ...initialRolePresets, [v]: {} };
        onUpdate(tab, updated);
      } else {
        const updated = [...items, v];
        setItems(updated);
        onUpdate(tab, updated);
      }
    }
    setNewValue("");
  };

  const handleSaveEdit = (idx: number) => {
    if (!editValue.trim()) return;
    const isText = ["SUPERVISOR", "OPERATOR", "MACHINE", "STAGE", "ROLE_PRESET"].includes(tab);
    const v = isText ? editValue.trim() : editValue.trim().toUpperCase();
    
    if (tab === "ROLE_PRESET") {
      const oldKey = items[idx];
      const newPresets = { ...initialRolePresets };
      newPresets[v] = newPresets[oldKey];
      delete newPresets[oldKey];
      onUpdate(tab, newPresets);
    } else {
      const updated = [...items];
      updated[idx] = v;
      setItems(updated);
      onUpdate(tab, updated);
    }
    setEditingIndex(null);
  };

  const handleDelete = (idx: number) => {
    if (tab === "ROLE_PRESET") {
      const key = items[idx];
      const newPresets = { ...initialRolePresets };
      delete newPresets[key];
      onUpdate(tab, newPresets);
    } else {
      const updated = items.filter((_, i) => i !== idx);
      setItems(updated);
      onUpdate(tab, updated);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Manage Lookups" size="md">
      <div className="py-2">
        <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 mb-4 overflow-x-auto">
          <Button variant={tab === "STATUS" ? "default" : "outline"} size="sm" onClick={() => setTab("STATUS")}>Status</Button>
          <Button variant={tab === "PRIORITY" ? "default" : "outline"} size="sm" onClick={() => setTab("PRIORITY")}>Priority</Button>
          <Button variant={tab === "SUPERVISOR" ? "default" : "outline"} size="sm" onClick={() => setTab("SUPERVISOR")}>Supervisor</Button>
          <Button variant={tab === "OPERATOR" ? "default" : "outline"} size="sm" onClick={() => setTab("OPERATOR")}>Operator</Button>
          <Button variant={tab === "MACHINE" ? "default" : "outline"} size="sm" onClick={() => setTab("MACHINE")}>Machine</Button>
          <Button variant={tab === "STAGE" ? "default" : "outline"} size="sm" onClick={() => setTab("STAGE")}>Stage</Button>
          <Button variant={tab === "ROLE_PRESET" ? "default" : "outline"} size="sm" onClick={() => setTab("ROLE_PRESET")}>Role Preset</Button>
        </div>

        <div className="flex gap-2 mb-4">
          <Input 
            value={newValue} 
            onChange={(e) => setNewValue(e.target.value)} 
            placeholder={`Add new ${tab.toLowerCase()}...`}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          />
          <Button onClick={handleAdd}>Add</Button>
        </div>

        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between p-2 border border-slate-100 dark:border-slate-800 rounded-md">
              {editingIndex === idx ? (
                <div className="flex gap-2 w-full">
                  <Input 
                    autoFocus
                    value={editValue} 
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(idx); }}
                  />
                  <Button size="sm" onClick={() => handleSaveEdit(idx)}>Save</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingIndex(null)}>Cancel</Button>
                </div>
              ) : (
                <>
                  <span className="text-sm font-medium">{item}</span>
                  <div className="flex gap-1">
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => {
                        setEditingIndex(idx);
                        setEditValue(item);
                      }}
                    >
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => handleDelete(idx)}>
                      Delete
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-4">No custom items found.</p>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 text-right">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}
