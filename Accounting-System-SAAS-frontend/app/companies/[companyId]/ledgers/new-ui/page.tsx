"use client";

import useSWR from "swr";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { LedgerTable } from "@/components/ledger/LedgerTable";
import { LedgerDrawerForm } from "@/components/ledger/LedgerDrawerForm";
import type { Ledger as LedgerType } from "@/types/ledger";
import { api } from "@/lib/api";
import { useMenuAccess } from "@/components/MenuPermissionsContext";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function LedgersNewUiPage() {
  const params = useParams();
  const companyId = params?.companyId as string;
  const searchParams = useSearchParams();

  const { canRead, canUpdate } = useMenuAccess("accounting.masters.ledgers");

  const { data: rawLedgers, mutate } = useSWR(
    companyId ? `/ledgers/companies/${companyId}/ledgers` : null,
    fetcher
  );
  const { data: groups } = useSWR(
    companyId ? `/ledgers/companies/${companyId}/ledger-groups` : null,
    fetcher
  );
  const { data: gstLedgers } = useSWR(
    companyId ? `/ledgers/companies/${companyId}/ledgers?group=GST` : null,
    fetcher
  );

  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingLedger, setEditingLedger] = useState<LedgerType | undefined>(
    undefined
  );
  const [initializedFromUrl, setInitializedFromUrl] = useState(false);

  const ledgers: LedgerType[] = useMemo(() => {
    if (!rawLedgers) return [];
    return (rawLedgers as any[]).map((l) => ({
      id: l.id,
      name: l.name,
      groupName: l.group_name,
      openingBalance: Number(l.opening_balance || 0),
      openingType: (l.opening_balance_type as "DR" | "CR") || "DR",
      contactPerson: l.contact_person || null,
      phone: l.phone || null,
    }));
  }, [rawLedgers]);

  const filtered = useMemo(() => {
    return ledgers.filter((l) => {
      const term = search.trim().toLowerCase();
      if (term) {
        const nameStr = l.name.toLowerCase();
        const idStr = String(l.id).toLowerCase();
        if (!nameStr.includes(term) && !idStr.includes(term)) {
          return false;
        }
      }
      if (groupFilter && l.groupName !== groupFilter) return false;
      return true;
    });
  }, [ledgers, search, groupFilter]);

  // Open specific ledger from URL query parameter on first load
  useEffect(() => {
    if (!canUpdate) return;
    if (initializedFromUrl) return;
    const idParam = searchParams.get("ledger_id");
    if (!idParam) return;
    const id = Number(idParam);
    if (!id || !Number.isFinite(id)) return;
    const found = ledgers.find((l) => l.id === id);
    if (!found) return;
    setEditingLedger(found);
    setDrawerOpen(true);
    setInitializedFromUrl(true);
  }, [canUpdate, initializedFromUrl, ledgers, searchParams]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleOpenNew = () => {
    if (!canUpdate) return;
    setEditingLedger(undefined);
    setDrawerOpen(true);
  };

  const handleEdit = (ledger: LedgerType) => {
    if (!canUpdate) return;
    setEditingLedger(ledger);
    setDrawerOpen(true);
  };

  const handleDelete = async (ledger: LedgerType) => {
    if (!companyId || !canUpdate) return;
    if (!confirm(`Delete ledger "${ledger.name}"? This cannot be undone.`))
      return;
    await api.delete(`/ledgers/companies/${companyId}/ledgers/${ledger.id}`);
    mutate();
  };

  const handleSubmit = async (values: any) => {
    if (!companyId || !canUpdate) return;
    const payload = {
      name: values.name,
      group_id: Number(values.groupId),
      opening_balance: Number(values.openingBalance || 0),
      opening_balance_type: values.openingType === "DR" ? "DEBIT" : "CREDIT",
      email: values.email || null,
      phone: values.phone || null,
      address: values.address || null,
      gst_ledger_id: values.gstLedgerId ? Number(values.gstLedgerId) : null,
    };
    if (editingLedger) {
      await api.put(
        `/ledgers/companies/${companyId}/ledgers/${editingLedger.id}`,
        payload
      );
    } else {
      await api.post(`/ledgers/companies/${companyId}/ledgers`, payload);
    }
    setDrawerOpen(false);
    mutate();
  };

  if (!canRead) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Ledgers (New UI)"
          subtitle="You do not have permission to view ledgers for this company."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ledgers (New UI)"
        subtitle="Manage ledger masters using the new compact layout."
        actions={
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleOpenNew}
            disabled={!canUpdate}
          >
            New Ledger
          </Button>
        }
      />

      <LedgerTable
        ledgers={paged}
        groups={groups || []}
        search={search}
        onSearchChange={setSearch}
        groupFilter={groupFilter}
        onGroupFilterChange={setGroupFilter}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <LedgerDrawerForm
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        groups={groups || []}
        gstLedgers={gstLedgers || []}
        initialValues={
          editingLedger && {
            name: editingLedger.name,
            groupId:
              (groups || []).find((g: any) => g.name === editingLedger.groupName)?.id?.toString() ||
              "",
            openingBalance: editingLedger.openingBalance.toString(),
            openingType: editingLedger.openingType,
            email: "",
            phone: editingLedger.phone || "",
            address: "",
            gstLedgerId: "",
          }
        }
        onSubmit={handleSubmit}
      />
    </div>
  );
}
