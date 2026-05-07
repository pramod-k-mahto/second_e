"use client";

import useSWR from 'swr';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function LedgerGroupsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = params?.companyId as string;
  const { data: groups, mutate } = useSWR(
    companyId ? `/ledgers/companies/${companyId}/ledger-groups` : null,
    fetcher
  );

  const [name, setName] = useState('');
  const [groupType, setGroupType] = useState<'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE'>('ASSET');
  const [parentGroupId, setParentGroupId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE'>('ASSET');
  const [editParentId, setEditParentId] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'id' | 'name' | 'type'>('id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [parentSearch, setParentSearch] = useState('');

  // Precompute duplicate names (case-insensitive) for quick highlighting
  const duplicateNameIds = (() => {
    const map: Record<string, number[]> = {};
    (groups || []).forEach((g: any) => {
      const key = String(g.name || '').trim().toLowerCase();
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(g.id);
    });
    const dupIds = new Set<number>();
    Object.values(map).forEach((ids) => {
      if (ids.length > 1) {
        ids.forEach((id) => dupIds.add(id));
      }
    });
    return dupIds;
  })();

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Client-side duplicate name check (case-insensitive)
      const trimmedName = name.trim();
      if (!trimmedName) {
        setSubmitError('Name is required.');
        setSubmitting(false);
        return;
      }

      const existing = (groups || []).find((g: any) =>
        String(g.name || '').trim().toLowerCase() === trimmedName.toLowerCase()
      );
      if (existing) {
        setSubmitError(`A ledger group with the name "${trimmedName}" already exists (ID: ${existing.id}).`);
        setSubmitting(false);
        return;
      }

      await api.post(`/ledgers/companies/${companyId}/ledger-groups`, {
        name: trimmedName,
        group_type: groupType,
        parent_group_id: parentGroupId ? Number(parentGroupId) : null,
      });
      setName('');
      setParentGroupId('');
      setGroupType('ASSET');
      mutate();
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 409 && typeof detail === 'string') {
        setSubmitError(detail);
      } else {
        setSubmitError(detail || 'Failed to create ledger group');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // If a group_id is provided in the URL, automatically open that group in edit mode once data is loaded
  useEffect(() => {
    const idParam = searchParams.get('group_id');
    if (!idParam || !groups) return;
    const id = Number(idParam);
    if (!id || !Number.isFinite(id)) return;
    const found = (groups as any[]).find((g) => g.id === id);
    if (found) {
      startEdit(found);
    }
  }, [searchParams, groups]);

  const filteredAndSortedGroups = (() => {
    let list = groups || [];
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter((g: any) => {
        const name = (g.name || '').toString().toLowerCase();
        const type = (g.group_type || '').toString().toLowerCase();
        const idStr = String(g.id || '').toLowerCase();
        return name.includes(term) || type.includes(term) || idStr.includes(term);
      });
    }

    const sorted = [...list].sort((a: any, b: any) => {
      let av: any;
      let bv: any;
      if (sortBy === 'id') {
        av = a.id;
        bv = b.id;
      } else if (sortBy === 'name') {
        av = (a.name || '').toString().toLowerCase();
        bv = (b.name || '').toString().toLowerCase();
      } else {
        av = (a.group_type || '').toString().toLowerCase();
        bv = (b.group_type || '').toString().toLowerCase();
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  })();

  const filteredParentGroups = (() => {
    const term = parentSearch.trim().toLowerCase();
    let list = groups || [];
    if (term) {
      list = list.filter((g: any) => {
        const idStr = String(g.id || '').toLowerCase();
        const nameStr = String(g.name || '').toLowerCase();
        const typeStr = String(g.group_type || '').toLowerCase();
        return idStr.includes(term) || nameStr.includes(term) || typeStr.includes(term);
      });
    }
    return list;
  })();

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedGroups.length / pageSize));
  const pagedGroups = filteredAndSortedGroups.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (field: 'id' | 'name' | 'type') => {
    if (sortBy === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  const startEdit = (g: any) => {
    setEditingId(g.id);
    setEditName(g.name || '');
    setEditType(g.group_type || 'ASSET');
    setEditParentId(g.parent_group_id ? String(g.parent_group_id) : '');
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const handleUpdate = async (id: number) => {
    try {
      setEditError(null);
      await api.put(`/ledgers/companies/${companyId}/ledger-groups/${id}`, {
        name: editName,
        group_type: editType,
        parent_group_id: editParentId ? Number(editParentId) : null,
      });
      setEditingId(null);
      mutate();
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 409 && typeof detail === 'string') {
        setEditError(detail);
      } else {
        setEditError(detail || 'Failed to update ledger group');
      }
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this ledger group? This cannot be undone.')) return;
    try {
      setDeleteError(null);
      await api.delete(`/ledgers/companies/${companyId}/ledger-groups/${id}`);
      mutate();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (typeof detail === 'string') {
        setDeleteError(detail);
      } else if (Array.isArray(detail)) {
        const msgs = detail
          .map((d) => (d && typeof d === 'object' && 'msg' in d ? (d as any).msg : JSON.stringify(d)))
          .filter(Boolean)
          .join('; ');
        setDeleteError(msgs || 'Failed to delete ledger group');
      } else {
        setDeleteError(detail || 'Failed to delete ledger group');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6">
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Ledger Groups</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Organize chart of accounts into logical groupings.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-5">
          {deleteError && (
            <div className="mb-3 text-xs font-medium text-red-600 bg-red-50 p-2 rounded">{deleteError}</div>
          )}
          {editError && (
            <div className="mb-3 text-xs font-medium text-red-600 bg-red-50 p-2 rounded">{editError}</div>
          )}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 gap-3 text-xs w-full">
            <input
              type="search"
              placeholder="Search by ID, name, or type..."
              className="border rounded-lg border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 px-3 py-2 text-xs w-full md:w-64 outline-none transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">
              Total: {groups ? groups.length : 0} &nbsp;|&nbsp; Showing: {filteredAndSortedGroups.length}
            </div>
          </div>
          {!groups ? (
            <div className="text-sm text-slate-500">Loading...</div>
          ) : groups.length === 0 ? (
            <div className="text-sm text-slate-500">No ledger groups yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th
                    className="text-left py-2 w-16 cursor-pointer select-none"
                    onClick={() => toggleSort('id')}
                  >
                    ID{sortBy === 'id' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th
                    className="text-left py-2 cursor-pointer select-none"
                    onClick={() => toggleSort('name')}
                  >
                    Name{sortBy === 'name' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th
                    className="text-left py-2 cursor-pointer select-none"
                    onClick={() => toggleSort('type')}
                  >
                    Type{sortBy === 'type' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th className="text-left py-2">Parent</th>
                  <th className="text-left py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedGroups.map((g: any) => {
                  const isEditing = editingId === g.id;
                  return (
                    <tr key={g.id} className="border-b last:border-none">
                      <td className="py-2 text-xs text-slate-500">{g.id}</td>
                      <td className="py-2">
                        {isEditing ? (
                          <input
                            className="w-full border rounded px-2 py-1 text-xs"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <span>
                              {g.id} - {g.name}
                            </span>
                            {duplicateNameIds.has(g.id) && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] border border-amber-200">
                                Duplicate name
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-xs">
                        {isEditing ? (
                          <select
                            className="border rounded px-2 py-1 text-xs"
                            value={editType}
                            onChange={(e) => setEditType(e.target.value as any)}
                          >
                            <option value="ASSET">ASSET</option>
                            <option value="LIABILITY">LIABILITY</option>
                            <option value="INCOME">INCOME</option>
                            <option value="EXPENSE">EXPENSE</option>
                          </select>
                        ) : (
                          g.group_type
                        )}
                      </td>
                      <td className="py-2 text-xs text-slate-500">
                        {isEditing ? (
                          <select
                            className="w-full border rounded px-2 py-1 text-xs"
                            value={editParentId}
                            onChange={(e) => setEditParentId(e.target.value)}
                          >
                            <option value="">None</option>
                            {filteredParentGroups.map((pg: any) => (
                              <option key={pg.id} value={pg.id}>
                                {pg.id} - {pg.name} ({pg.group_type})
                              </option>
                            ))}
                          </select>
                        ) : g.parent_group_id ? (
                          groups.find((pg: any) => pg.id === g.parent_group_id)?.name || 'Parent'
                        ) : (
                          'None'
                        )}
                      </td>
                      <td className="py-2 text-xs space-x-2">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleUpdate(g.id)}
                              className="px-2 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="px-2 py-1 rounded border border-slate-200 text-slate-500 bg-white hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(g)}
                              className="px-2 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(g.id)}
                              className="px-2 py-1 rounded border border-red-300 text-red-700 bg-white hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {groups && groups.length > 0 && (
            <div className="mt-2 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                className="px-2 py-1 rounded border border-slate-300 bg-white disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="text-slate-600">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="px-2 py-1 rounded border border-slate-300 bg-white disabled:opacity-40"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-5 h-min">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Create Ledger Group</h2>
        {submitError && <div className="text-xs font-medium text-red-600 mb-4 bg-red-50 p-2 rounded">{submitError}</div>}
        <form onSubmit={handleCreate} className="space-y-3 text-sm">
          <div>
            <label className="block mb-1">Name</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex gap-3">
            <div>
              <label className="block mb-1">Type</label>
              <select
                className="border rounded px-3 py-2"
                value={groupType}
                onChange={(e) => setGroupType(e.target.value as any)}
              >
                <option value="ASSET">ASSET</option>
                <option value="LIABILITY">LIABILITY</option>
                <option value="INCOME">INCOME</option>
                <option value="EXPENSE">EXPENSE</option>
              </select>
            </div>
            <div className="flex-1 space-y-1">
              <label className="block mb-1">Parent Group (optional)</label>
              <input
                type="text"
                className="w-full border rounded px-3 py-1 text-xs"
                placeholder="Search parent groups by ID, name, or type..."
                value={parentSearch}
                onChange={(e) => setParentSearch(e.target.value)}
              />
              <select
                className="w-full border rounded px-3 py-2 text-xs mt-1"
                value={parentGroupId}
                onChange={(e) => setParentGroupId(e.target.value)}
              >
                <option value="">None</option>
                {filteredParentGroups.map((g: any) => (
                  <option key={g.id} value={g.id}>
                    {g.id} - {g.name} ({g.group_type})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? 'Saving…' : 'Save Group'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold transition-all duration-150"
            >
              Close
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
