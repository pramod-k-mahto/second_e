"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { IMPORT_DATA_TYPES, IMPORT_SOURCE_TYPES } from "@/lib/import/constants";
import type { ImportDataType, ImportSourceType } from "@/lib/import/types";
import { createImportJob } from "@/lib/import/api";
import { addRecentImportJob } from "@/lib/import/recentJobs";
import { getRecommendedOrderWarning } from "@/lib/import/recommendedOrder";

type Company = { id: number; name: string };
type Tenant = { id: number; name: string };

const schema = z.object({
  tenant_id: z.number().optional(),
  company_id: z.number({ required_error: "Company is required" }),
  source_type: z.enum(["excel", "csv", "json", "tally", "woocommerce", "shopify"]),
  data_type: z.enum([
    "masters_ledgers",
    "masters_items",
    "masters_warehouses",
    "opening_balances",
    "stock_opening",
    "sales_invoices",
    "purchase_invoices",
    "payments_receipts",
    "journals",
    "orders",
  ]),
});

type FormValues = z.infer<typeof schema>;

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function AdminImportNewPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const { data: me } = useSWR("/auth/me", fetcher);
  const role = String(me?.role || "").toLowerCase();
  const isSuperAdmin = role === "superadmin";

  const { data: companies, isLoading: companiesLoading, error: companiesError } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const res = await api.get<Company[]>("/companies/");
      return res.data || [];
    },
    staleTime: 30_000,
  });

  const { data: tenants } = useQuery({
    queryKey: ["adminTenants"],
    queryFn: async () => {
      const res = await api.get<Tenant[]>("/admin/tenants");
      return res.data || [];
    },
    enabled: isSuperAdmin,
    staleTime: 30_000,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      source_type: "excel",
      data_type: "masters_ledgers",
    } as any,
  });

  const selectedDataType = form.watch("data_type") as ImportDataType | undefined;

  const orderWarning = React.useMemo(() => {
    return getRecommendedOrderWarning({ selectedType: selectedDataType });
  }, [selectedDataType]);

  const createMutation = useMutation({
    mutationFn: (payload: {
      tenant_id?: number | null;
      company_id: number;
      source_type: ImportSourceType;
      data_type: ImportDataType;
    }) => createImportJob(payload),
    onSuccess: async (data) => {
      const id = String((data as any)?.id);
      addRecentImportJob({ id });
      router.push(`/admin/import/jobs/${id}`);
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      showToast({
        title: "Create job",
        description: typeof detail === "string" ? detail : "Failed to create import job",
        variant: "error",
      });
    },
  });

  const onSubmit = (values: FormValues) => {
    createMutation.mutate({
      tenant_id: isSuperAdmin ? values.tenant_id ?? null : undefined,
      company_id: values.company_id,
      source_type: values.source_type as ImportSourceType,
      data_type: values.data_type as ImportDataType,
    });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="New Import"
        subtitle="Create an import job, then upload a file, configure mapping, validate, and commit."
      />

      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit(onSubmit)();
          }}
        >
          {isSuperAdmin && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Tenant</label>
              <Select
                value={String(form.watch("tenant_id") ?? "")}
                onChange={(e) => {
                  const v = e.target.value;
                  form.setValue("tenant_id", v ? Number(v) : undefined);
                }}
              >
                <option value="">Select tenant</option>
                {(tenants || []).map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.name}
                  </option>
                ))}
              </Select>
              {form.formState.errors.tenant_id && (
                <div className="text-[11px] text-critical-600">
                  {String(form.formState.errors.tenant_id.message || "Invalid tenant")}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Company</label>
            <Select
              value={String(form.watch("company_id") ?? "")}
              onChange={(e) => {
                const v = e.target.value;
                form.setValue("company_id", v ? Number(v) : (undefined as any), { shouldValidate: true });
              }}
            >
              <option value="">Select company</option>
              {(companies || []).map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </Select>
            {companiesLoading && <div className="text-[11px] text-slate-500">Loading companies…</div>}
            {companiesError && (
              <div className="text-[11px] text-critical-600">
                {(companiesError as any)?.response?.data?.detail || "Failed to load companies"}
              </div>
            )}
            {form.formState.errors.company_id && (
              <div className="text-[11px] text-critical-600">
                {String(form.formState.errors.company_id.message)}
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Source type</label>
              <Select
                value={String(form.watch("source_type") || "")}
                onChange={(e) => form.setValue("source_type", e.target.value as any)}
              >
                {IMPORT_SOURCE_TYPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
              {form.formState.errors.source_type && (
                <div className="text-[11px] text-critical-600">
                  {String(form.formState.errors.source_type.message)}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Data type</label>
              <Select
                value={String(form.watch("data_type") || "")}
                onChange={(e) => form.setValue("data_type", e.target.value as any)}
              >
                {IMPORT_DATA_TYPES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
              {form.formState.errors.data_type && (
                <div className="text-[11px] text-critical-600">
                  {String(form.formState.errors.data_type.message)}
                </div>
              )}
            </div>
          </div>

          {orderWarning.level !== "none" && (
            <div
              className={[
                "rounded-md border px-3 py-2 text-xs",
                orderWarning.level === "warning"
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : "border-slate-200 bg-slate-50 text-slate-700",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {orderWarning.message}
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" isLoading={createMutation.isPending}>
              Create Job
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
