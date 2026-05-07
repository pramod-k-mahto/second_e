"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Check, ChevronDown, X, Search, Filter } from "lucide-react";
import type { TaskStatus } from "@/lib/tasks/types";
import type { TaskSort } from "@/lib/tasks/api";
import { useQuery } from "@tanstack/react-query";
import { listCustomers, listDepartments, listProjects } from "@/lib/api";
import { listTaskHeads } from "@/lib/tasks/api";
import { usePermissions } from "@/components/PermissionsContext";

export type TaskFiltersValue = {
  q: string;
  status: "all" | TaskStatus;
  sort: TaskSort;
  skip: number;
  limit: number;
  customer_ids?: number[];
  department_ids?: number[];
  project_ids?: number[];
  task_head_ids?: number[];
  employee_id?: string;
  priority?: string;
};

export function TaskFilters({
  companyId,
  value,
  onChange,
}: {
  companyId: number;
  value: TaskFiltersValue;
  onChange: (next: TaskFiltersValue) => void;
}) {
  const { isTenantAdmin, isSuperAdmin } = usePermissions();
  const isAdmin = isTenantAdmin || isSuperAdmin;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[200px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={value.q}
            onChange={(e) => onChange({ ...value, q: e.target.value, skip: 0 })}
            placeholder="Search tasks..."
            className="pl-9 h-10 border-slate-200 focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="w-40 shrink-0">
        <Select
          value={value.sort}
          onChange={(e) => onChange({ ...value, sort: e.target.value as TaskSort, skip: 0 })}
          className="h-10 border-slate-200"
        >
          <option value="updated_desc">Recently Updated</option>
          <option value="due_asc">Due Date</option>
          <option value="created_desc">Recently Created</option>
        </Select>
      </div>

      <div className="w-36 shrink-0">
        <Select
          value={value.status}
          onChange={(e) => onChange({ ...value, status: e.target.value as any, skip: 0 })}
          className="h-10 border-slate-200"
        >
          <option value="all">All Status</option>
          <option value="todo">Todo</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </Select>
      </div>

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
           <MultiFilterSelect
              placeholder="Customer"
              value={value.customer_ids}
              companyId={companyId}
              fetchFn={listCustomers}
              onChange={(ids) => onChange({ ...value, customer_ids: ids as number[], skip: 0 })}
           />
           <MultiFilterSelect
              placeholder="Dept"
              value={value.department_ids}
              companyId={companyId}
              fetchFn={listDepartments}
              onChange={(ids) => onChange({ ...value, department_ids: ids as number[], skip: 0 })}
           />
           <MultiFilterSelect
              placeholder="Project"
              value={value.project_ids}
              companyId={companyId}
              fetchFn={listProjects}
              onChange={(ids) => onChange({ ...value, project_ids: ids as number[], skip: 0 })}
           />
           <MultiFilterSelect
              placeholder="Category"
              value={value.task_head_ids}
              companyId={companyId}
              fetchFn={listTaskHeads}
              onChange={(ids) => onChange({ ...value, task_head_ids: ids as number[], skip: 0 })}
           />
        </div>
      )}
    </div>
  );
}

export function MultiFilterSelect({
  placeholder,
  value,
  companyId,
  fetchFn,
  onChange,
  single = false,
  className = "",
}: {
  placeholder: string;
  value?: number | number[];
  companyId: number;
  fetchFn: (companyId: number) => Promise<any[]>;
  onChange: (val?: number | number[]) => void;
  single?: boolean;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: [placeholder.toLowerCase().replace(" ", "-") + "-list", companyId],
    queryFn: () => fetchFn(companyId),
    enabled: !!companyId,
  });

  const selectedIds = Array.isArray(value) ? value : value ? [value] : [];
  
  const filteredData = data?.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleId = (id: number) => {
    if (single) {
      if (selectedIds.includes(id)) {
        onChange(undefined);
      } else {
        onChange(id);
      }
      setIsOpen(false);
      return;
    }
    const next = selectedIds.includes(id)
      ? selectedIds.filter(x => x !== id)
      : [...selectedIds, id];
    onChange(next.length ? next : undefined);
  };

  const getLabel = () => {
    if (selectedIds.length === 0) return placeholder;
    if (selectedIds.length === 1) {
      const item = data?.find(x => x.id === selectedIds[0]);
      return item ? item.name : `${placeholder} #${selectedIds[0]}`;
    }
    return `${selectedIds.length} ${placeholder}s`;
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-10 min-w-[120px] items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm ring-offset-white transition-all hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${selectedIds.length > 0 ? 'border-indigo-600 bg-indigo-50/10' : ''}`}
      >
        <span className="truncate mr-2 font-medium">{getLabel()}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-[100] mt-2 w-72 max-h-96 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200 left-0">
          <div className="p-2 border-b border-slate-100 bg-slate-50/50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                autoFocus
                className="w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                placeholder={`Search ${placeholder.toLowerCase()}...`}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          
          <div className="max-h-64 overflow-auto p-1 custom-scrollbar">
            <button
               type="button"
               onClick={() => { onChange(undefined); if(single) setIsOpen(false); }}
               className="flex w-full items-center px-3 py-2 text-xs font-semibold hover:bg-slate-100 rounded-md text-red-600 transition-colors"
            >
               <X className="w-3.5 h-3.5 mr-2" />
               Clear Selection
            </button>
            <div className="h-px bg-slate-100 my-1" />
            
            {filteredData?.map((item) => {
              const checked = selectedIds.includes(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => toggleId(item.id)}
                  className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-all ${checked ? 'bg-indigo-50 text-indigo-700 font-medium' : 'hover:bg-slate-50 text-slate-600'}`}
                >
                  <div className={`flex h-4 w-4 items-center justify-center rounded border transition-all ${checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}>
                     {checked && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <span className="flex-1 truncate">{item.name}</span>
                </div>
              );
            })}
            
            {filteredData?.length === 0 && (
              <div className="py-12 text-center text-xs text-slate-400 italic">
                 <Filter className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                 No results found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Keep FilterSelect for backward compatibility if needed, but we'll use MultiFilterSelect
export function FilterSelect({
  placeholder,
  value,
  companyId,
  fetchFn,
  onChange,
}: {
  placeholder: string;
  value?: number;
  companyId: number;
  fetchFn: (companyId: number) => Promise<any[]>;
  onChange: (id?: number) => void;
}) {
    return <MultiFilterSelect 
        placeholder={placeholder} 
        value={value} 
        companyId={companyId} 
        fetchFn={fetchFn} 
        onChange={(val) => onChange(val as number)}
        single 
        className="w-full md:w-40"
    />;
}
