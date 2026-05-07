"use client";

import useSWR from 'swr';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useMenuAccess } from '@/components/MenuPermissionsContext';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function LedgersPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;

  const { canRead } = useMenuAccess('accounting.masters.ledgers');

  const canRender = canRead;

  const { data: groups } = useSWR(
    companyId ? `/ledgers/companies/${companyId}/ledger-groups` : null,
    fetcher,
  );

  const { data: ledgers, mutate } = useSWR(
    companyId ? `/ledgers/companies/${companyId}/ledgers` : null,
    fetcher,
  );

  // Create ledger state
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [openingType, setOpeningType] = useState<'DEBIT' | 'CREDIT'>('DEBIT');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Create ledger group state
  const [groupName, setGroupName] = useState('');
  const [groupType, setGroupType] = useState<'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE'>('ASSET');
  const [parentGroupId, setParentGroupId] = useState('');
  const [groupSubmitting, setGroupSubmitting] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [parentGroupSearch, setParentGroupSearch] = useState('');

  // Create Ledger — searchable group combobox
  const [groupSearch, setGroupSearch] = useState('');
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const groupComboRef = useRef<HTMLDivElement>(null);
  const selectedGroupName =
    (groups as any[])?.find((g: any) => String(g.id) === String(groupId))?.name ?? '';
  const filteredCreateGroups = groupSearch.trim()
    ? ((groups as any[]) || []).filter((g: any) =>
      g.name.toLowerCase().includes(groupSearch.trim().toLowerCase()) ||
      String(g.id).includes(groupSearch.trim())
    )
    : ((groups as any[]) || []);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (groupComboRef.current && !groupComboRef.current.contains(e.target as Node)) {
        // Delay so click on dropdown item registers first
        setTimeout(() => setGroupDropdownOpen(false), 150);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Delete error state
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // List filter/sort state
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'id' | 'name' | 'group' | 'opening'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editGroupId, setEditGroupId] = useState('');
  const [editOpeningBalance, setEditOpeningBalance] = useState('0');
  const [editOpeningType, setEditOpeningType] = useState<'DEBIT' | 'CREDIT'>('DEBIT');
  const [editError, setEditError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const trimmedName = name.trim();
      if (!trimmedName) {
        setSubmitError('Name is required.');
        setSubmitting(false);
        return;
      }

      // Client-side duplicate name check (case-insensitive)
      if (ledgers && Array.isArray(ledgers)) {
        const existing = (ledgers as any[]).find((l) =>
          String(l.name || '').trim().toLowerCase() === trimmedName.toLowerCase()
        );
        if (existing) {
          setSubmitError(`A ledger with the name "${trimmedName}" already exists (ID: ${existing.id}).`);
          setSubmitting(false);
          return;
        }
      }

      await api.post(`/ledgers/companies/${companyId}/ledgers`, {
        name: trimmedName,
        group_id: Number(groupId),
        opening_balance: Number(openingBalance || '0'),
        opening_balance_type: openingType,
      });
      setName('');
      setGroupId('');
      setOpeningBalance('0');
      setOpeningType('DEBIT');
      mutate();
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 409 && typeof detail === 'string') {
        setSubmitError(detail);
      } else {
        setSubmitError(detail || 'Failed to create ledger');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateGroup(e: FormEvent) {
    e.preventDefault();
    if (!groupName.trim()) return;
    setGroupSubmitting(true);
    setGroupError(null);
    try {
      await api.post(`/ledgers/companies/${companyId}/ledger-groups`, {
        name: groupName,
        group_type: groupType,
        parent_group_id: parentGroupId ? Number(parentGroupId) : null,
      });
      setGroupName('');
      setParentGroupId('');
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 409 && typeof detail === 'string') {
        setGroupError(detail);
      } else {
        setGroupError(detail || 'Failed to create ledger group');
      }
    } finally {
      setGroupSubmitting(false);
    }
  }

  function startEdit(ledger: any) {
    setEditingId(ledger.id);
    setEditName(ledger.name || '');
    setEditGroupId(String(ledger.group_id));
    setEditOpeningBalance(String(ledger.opening_balance ?? '0'));
    setEditOpeningType(ledger.opening_balance_type || 'DEBIT');
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function handleUpdate(ledgerId: number) {
    try {
      setEditError(null);
      await api.put(`/ledgers/companies/${companyId}/ledgers/${ledgerId}`, {
        name: editName,
        group_id: Number(editGroupId),
        opening_balance: Number(editOpeningBalance || '0'),
        opening_balance_type: editOpeningType,
      });
      setEditingId(null);
      mutate();
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 409 && typeof detail === 'string') {
        setEditError(detail);
      } else {
        setEditError(detail || 'Failed to update ledger');
      }
    }
  }

  async function handleDelete(ledgerId: number) {
    if (!confirm('Delete this ledger? This cannot be undone.')) return;
    try {
      setDeleteError(null);
      await api.delete(`/ledgers/companies/${companyId}/ledgers/${ledgerId}`);
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
        setDeleteError(msgs || 'Failed to delete ledger');
      } else {
        setDeleteError(detail || 'Failed to delete ledger');
      }
    }
  }

  let filteredAndSortedLedgers: any[] = [];
  if (ledgers) {
    let list = ledgers as any[];
    const term = search.trim().toLowerCase();

    if (term) {
      list = list.filter((ledger: any) => {
        const idStr = String(ledger.id ?? '').toLowerCase();
        const nameStr = (ledger.name || '').toString().toLowerCase();
        const groupIdStr = String(ledger.group_id ?? '').toLowerCase();
        const groupStr =
          groups?.find((g: any) => g.id === ledger.group_id)?.name?.toString().toLowerCase() || '';
        const openingStr = `${ledger.opening_balance ?? ''} ${ledger.opening_balance_type ?? ''}`
          .toString()
          .toLowerCase();

        return (
          idStr.includes(term) ||
          nameStr.includes(term) ||
          groupIdStr.includes(term) ||
          groupStr.includes(term) ||
          openingStr.includes(term)
        );
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
      } else if (sortBy === 'group') {
        const ag = groups?.find((g: any) => g.id === a.group_id)?.name || '';
        const bg = groups?.find((g: any) => g.id === b.group_id)?.name || '';
        av = ag.toString().toLowerCase();
        bv = bg.toString().toLowerCase();
      } else {
        const ao = `${a.opening_balance ?? ''} ${a.opening_balance_type ?? ''}`;
        const bo = `${b.opening_balance ?? ''} ${b.opening_balance_type ?? ''}`;
        av = ao.toString().toLowerCase();
        bv = bo.toString().toLowerCase();
      }

      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    filteredAndSortedLedgers = sorted;
  }

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedLedgers.length / pageSize));
  const pagedLedgers = filteredAndSortedLedgers.slice((page - 1) * pageSize, page * pageSize);

  const filteredParentGroups = (() => {
    const term = parentGroupSearch.trim().toLowerCase();
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

  function toggleSort(field: 'id' | 'name' | 'group' | 'opening') {
    if (sortBy === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  }

  if (!canRender) {
    return (
      <div className="space-y-4">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Ledgers</h1>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-3 py-1 rounded border border-slate-300 text-xs"
          >
            Close
          </button>
        </div>
        <div className="text-sm text-slate-600">
          You do not have permission to view ledgers for this company.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6">
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800/40">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Ledgers Master</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Manage your chart of accounts and opening balances.
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
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Create Ledger Group</h2>
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 dark:text-slate-200 text-xs font-semibold bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700"
              onClick={() => router.push(`/companies/${companyId}/ledger-groups`)}
            >
              Manage Groups
            </button>
          </div>
          {groupError && <div className="text-xs font-medium text-red-600 mb-3 bg-red-50 p-2 rounded">{groupError}</div>}
          <form onSubmit={handleCreateGroup} className="space-y-3 text-sm">
            <div>
              <label className="block mb-1">Name</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
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
                  value={parentGroupSearch}
                  onChange={(e) => setParentGroupSearch(e.target.value)}
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
                {parentGroupId && (
                  <button
                    type="button"
                    className="mt-1 px-2 py-1 rounded border border-slate-300 text-[11px] bg-white hover:bg-slate-50"
                    onClick={() =>
                      router.push(`/companies/${companyId}/ledger-groups?group_id=${parentGroupId}`)
                    }
                  >
                    Edit selected parent group
                  </button>
                )}
              </div>
            </div>
            <button
              type="submit"
              disabled={groupSubmitting}
              className="px-4 py-2 rounded bg-slate-900 text-white text-sm disabled:opacity-60"
            >
              {groupSubmitting ? 'Saving…' : 'Save Group'}
            </button>
          </form>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-5 max-w-lg">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Create Ledger</h2>
          {submitError && <div className="text-xs font-medium text-red-600 mb-3 bg-red-50 p-2 rounded">{submitError}</div>}
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
            <div>
              <label className="block mb-1">Group</label>
              <div ref={groupComboRef} className="relative">
                {/* Search input */}
                <div className="relative flex items-center border rounded bg-white">
                  <svg
                    className="pointer-events-none absolute left-2.5 h-4 w-4 text-slate-400"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                  <input
                    type="text"
                    className="w-full rounded bg-transparent pl-8 pr-8 py-2 text-sm focus:outline-none"
                    placeholder={selectedGroupName || 'Search group...'}
                    value={groupSearch}
                    onChange={(e) => {
                      setGroupSearch(e.target.value);
                      setGroupDropdownOpen(true);
                      if (!e.target.value) setGroupId('');
                    }}
                    onFocus={() => setGroupDropdownOpen(true)}
                  />
                  {(groupSearch || groupId) && (
                    <button
                      type="button"
                      className="absolute right-2 text-slate-400 hover:text-slate-600"
                      onClick={() => {
                        setGroupSearch('');
                        setGroupId('');
                        setGroupDropdownOpen(true);
                      }}
                    >✕</button>
                  )}
                </div>

                {/* Dropdown */}
                {groupDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-0.5 max-h-56 overflow-y-auto rounded border border-slate-200 bg-white shadow-lg">
                    {filteredCreateGroups.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-400">No groups match &quot;{groupSearch}&quot;</div>
                    ) : (
                      filteredCreateGroups.map((g: any) => (
                        <button
                          key={g.id}
                          type="button"
                          className={[
                            'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-blue-50',
                            String(g.id) === String(groupId)
                              ? 'bg-blue-50 font-medium text-blue-700'
                              : 'text-slate-800',
                          ].join(' ')}
                          onClick={() => {
                            setGroupId(String(g.id));
                            setGroupSearch('');
                            setGroupDropdownOpen(false);
                          }}
                        >
                          <span className="text-xs text-slate-400 w-6 shrink-0">{g.id}</span>
                          <span>{g.name}</span>
                          <span className="ml-auto text-[10px] text-slate-400">{g.group_type}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block mb-1">Opening Balance</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full border rounded px-3 py-2"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                />
              </div>
              <div>
                <label className="block mb-1">Type</label>
                <select
                  className="border rounded px-3 py-2"
                  value={openingType}
                  onChange={(e) => setOpeningType(e.target.value as any)}
                >
                  <option value="DEBIT">DEBIT</option>
                  <option value="CREDIT">CREDIT</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded bg-slate-900 text-white text-sm disabled:opacity-60"
            >
              {submitting ? 'Saving…' : 'Save Ledger'}
            </button>
          </form>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-5">
        {deleteError && (
          <div className="mb-2 text-sm text-red-600">{deleteError}</div>
        )}
        {editError && (
          <div className="mb-2 text-sm text-red-600">{editError}</div>
        )}
        <div className="mb-2 flex items-center justify-between text-xs">
          <div className="text-slate-600">
            Total: {ledgers ? ledgers.length : 0} &nbsp;|&nbsp; Showing page {page} of {totalPages}
          </div>
          <input
            type="text"
            placeholder="Search by ID, name, group, or opening..."
            className="border rounded px-2 py-1 text-xs min-w-[200px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {!ledgers ? (
          <div className="text-sm text-slate-500">Loading...</div>
        ) : ledgers.length === 0 ? (
          <div className="text-sm text-slate-500">No ledgers yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th
                  className="text-left py-2 w-16 text-xs text-slate-500 cursor-pointer select-none"
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
                  onClick={() => toggleSort('group')}
                >
                  Group{sortBy === 'group' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
                <th
                  className="text-right py-2 cursor-pointer select-none"
                  onClick={() => toggleSort('opening')}
                >
                  Opening{sortBy === 'opening' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
                <th className="text-left py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedLedgers.map((ledger: any) => {
                const group = groups?.find((g: any) => g.id === ledger.group_id);
                const isEditing = editingId === ledger.id;

                return (
                  <tr key={ledger.id} className="border-b last:border-none">
                    <td className="py-2 text-xs text-slate-500">{ledger.id}</td>
                    <td className="py-2">
                      {isEditing ? (
                        <input
                          className="w-full border rounded px-2 py-1 text-xs"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      ) : (
                        ledger.name
                      )}
                    </td>
                    <td className="py-2 text-xs text-slate-500">
                      {isEditing ? (
                        <select
                          className="w-full border rounded px-2 py-1 text-xs"
                          value={editGroupId}
                          onChange={(e) => setEditGroupId(e.target.value)}
                        >
                          <option value="">Select group</option>
                          {groups?.map((g: any) => (
                            <option key={g.id} value={g.id}>
                              {g.id} - {g.name} ({g.group_type})
                            </option>
                          ))}
                        </select>
                      ) : group ? (
                        <span>
                          {group.id} - {group.name}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 text-right text-xs">
                      {isEditing ? (
                        <div className="flex items-center gap-2 justify-end">
                          <input
                            type="number"
                            step="0.01"
                            className="w-24 border rounded px-2 py-1 text-right"
                            value={editOpeningBalance}
                            onChange={(e) => setEditOpeningBalance(e.target.value)}
                          />
                          <select
                            className="border rounded px-2 py-1 text-xs"
                            value={editOpeningType}
                            onChange={(e) =>
                              setEditOpeningType(e.target.value as 'DEBIT' | 'CREDIT')
                            }
                          >
                            <option value="DEBIT">DEBIT</option>
                            <option value="CREDIT">CREDIT</option>
                          </select>
                        </div>
                      ) : (
                        <span>
                          {ledger.opening_balance} {ledger.opening_balance_type}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-xs">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleUpdate(ledger.id)}
                            className="px-2 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="ml-2 px-2 py-1 rounded border border-slate-200 text-slate-500 bg-white hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(ledger)}
                            className="px-2 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(ledger.id)}
                            className="ml-2 px-2 py-1 rounded border border-red-300 text-red-700 bg-white hover:bg-red-50"
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
        {ledgers && ledgers.length > 0 && (
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
  );
}
