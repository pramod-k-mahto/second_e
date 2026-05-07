import { parseSalesPersonIds } from "@/components/sales/SalesPersonMultiSearchSelect";

export type InvoiceLineLike = {
  item_id: string;
  quantity: string;
  rate: string;
  discount: string;
  tax_rate: string;
  sales_person_id?: string;
  department_id?: string;
  project_id?: string;
  segment_id?: string;
};

export type IncentiveRulePreview = {
  id: number;
  name: string;
  basis_type: string;
  threshold_min: number;
  threshold_max: number | null;
  incentive_type: string;
  incentive_value: number;
  sales_person_id: number | null;
  department_id: number | null;
  project_id: number | null;
  segment_id: number | null;
  item_id: number | null;
  is_active?: boolean;
};

export type MatchedRuleBreakdown = { ruleId: number; ruleName: string; amount: number };

export type PersonIncentivePreview = {
  salesPersonId: number;
  name: string;
  attributedSales: number;
  attributedQty: number;
  calculatedIncentive: number;
  matchedRules: MatchedRuleBreakdown[];
};

function numOrNull(s: string | undefined, useHeader: boolean, headerVal: string): number | null {
  const raw = s && String(s).trim() !== "" ? s : useHeader ? headerVal : "";
  const n = Number(raw);
  return raw !== "" && Number.isFinite(n) ? n : null;
}

function lineMatchesRuleFilters(
  rule: IncentiveRulePreview,
  line: InvoiceLineLike,
  ctx: {
    showDepartment: boolean;
    departmentId: string;
    showProject: boolean;
    projectId: string;
    showSegment: boolean;
    segmentId: string;
  }
): boolean {
  const dept = numOrNull(line.department_id, ctx.showDepartment, ctx.departmentId);
  const proj = numOrNull(line.project_id, ctx.showProject, ctx.projectId);
  const seg = numOrNull(line.segment_id, ctx.showSegment, ctx.segmentId);

  if (rule.department_id != null && rule.department_id !== dept) return false;
  if (rule.project_id != null && rule.project_id !== proj) return false;
  if (rule.segment_id != null && rule.segment_id !== seg) return false;
  if (rule.item_id != null && String(rule.item_id) !== String(line.item_id)) return false;
  return true;
}

function effectiveLineSalesPersonIds(line: InvoiceLineLike, headerCsv: string): string[] {
  const fromLine = parseSalesPersonIds(line.sales_person_id);
  if (fromLine.length) return fromLine;
  return parseSalesPersonIds(headerCsv);
}

function basisMetric(
  basisType: string,
  basePreTax: number,
  qty: number
): number {
  const t = (basisType || "").toLowerCase();
  if (t === "qty" || t === "target_qty") return qty;
  return basePreTax;
}

function ruleAppliesToPerson(rule: IncentiveRulePreview, personId: number): boolean {
  if (rule.sales_person_id != null && Number(rule.sales_person_id) !== personId) return false;
  return true;
}

function inThreshold(metric: number, min: number, max: number | null): boolean {
  if (metric < min) return false;
  if (max != null && metric > max) return false;
  return true;
}

/**
 * Preview incentive per sales person for the current draft invoice, using the same
 * incentive rules as Settings ▸ Incentives. This is an approximation of server-side
 * report logic for quick validation while entering an invoice.
 */
export function computeInvoiceIncentivePreviews(
  lines: InvoiceLineLike[],
  headerSalesPersonCsv: string,
  salesPeople: { id: number; name?: string; full_name?: string }[],
  rules: IncentiveRulePreview[],
  costCenterCtx: {
    showDepartment: boolean;
    departmentId: string;
    showProject: boolean;
    projectId: string;
    showSegment: boolean;
    segmentId: string;
  }
): PersonIncentivePreview[] {
  const activeRules = (rules || []).filter((r) => r && (r.is_active !== false));

  const idSet = new Set<number>();
  for (const idStr of parseSalesPersonIds(headerSalesPersonCsv)) {
    const n = Number(idStr);
    if (Number.isFinite(n)) idSet.add(n);
  }
  for (const line of lines) {
    for (const idStr of effectiveLineSalesPersonIds(line, headerSalesPersonCsv)) {
      const n = Number(idStr);
      if (Number.isFinite(n)) idSet.add(n);
    }
  }

  const spName = (id: number) => {
    const p = salesPeople.find((s) => s.id === id);
    return (p?.name || (p as { full_name?: string })?.full_name || `Person #${id}`).trim();
  };

  const persons: PersonIncentivePreview[] = [];

  for (const personId of [...idSet].sort((a, b) => a - b)) {
    let attributedSales = 0;
    let attributedQty = 0;

    for (const line of lines) {
      if (!line.item_id) continue;
      const ids = effectiveLineSalesPersonIds(line, headerSalesPersonCsv);
      if (!ids.some((id) => Number(id) === personId)) continue;
      const share = 1 / Math.max(ids.length, 1);
      const qtyUi = Number(line.quantity || "0");
      const rateUi = Number(line.rate || "0");
      const disc = Number(line.discount || "0");
      const taxRate = Number(line.tax_rate || "0");
      const base = qtyUi * rateUi - disc;
      const tax = (base * taxRate) / 100;
      const lineTotal = base + tax;
      attributedSales += lineTotal * share;
      attributedQty += qtyUi * share;
    }

    let calculatedIncentive = 0;
    const matchedRules: MatchedRuleBreakdown[] = [];

    for (const rule of activeRules) {
      if (!ruleAppliesToPerson(rule, personId)) continue;

      let metric = 0;
      for (const line of lines) {
        if (!line.item_id) continue;
        const ids = effectiveLineSalesPersonIds(line, headerSalesPersonCsv);
        if (!ids.some((id) => Number(id) === personId)) continue;
        if (!lineMatchesRuleFilters(rule, line, costCenterCtx)) continue;

        const share = 1 / Math.max(ids.length, 1);
        const qtyUi = Number(line.quantity || "0");
        const rateUi = Number(line.rate || "0");
        const disc = Number(line.discount || "0");
        const base = qtyUi * rateUi - disc;
        metric += basisMetric(rule.basis_type, base * share, qtyUi * share);
      }

      if (!inThreshold(metric, Number(rule.threshold_min) || 0, rule.threshold_max)) continue;

      let add = 0;
      if ((rule.incentive_type || "").toLowerCase() === "fixed") {
        add = Number(rule.incentive_value) || 0;
      } else {
        add = (metric * (Number(rule.incentive_value) || 0)) / 100;
      }
      calculatedIncentive += add;
      matchedRules.push({
        ruleId: rule.id,
        ruleName: rule.name || `Rule #${rule.id}`,
        amount: add,
      });
    }

    persons.push({
      salesPersonId: personId,
      name: spName(personId),
      attributedSales,
      attributedQty,
      calculatedIncentive,
      matchedRules,
    });
  }

  return persons.sort((a, b) => a.name.localeCompare(b.name));
}

/** Sorted id list key for resetting override state when selection changes */
export function salesPersonSelectionKey(lines: InvoiceLineLike[], headerCsv: string): string {
  const idSet = new Set<number>();
  for (const idStr of parseSalesPersonIds(headerCsv)) {
    const n = Number(idStr);
    if (Number.isFinite(n)) idSet.add(n);
  }
  for (const line of lines) {
    for (const idStr of effectiveLineSalesPersonIds(line, headerCsv)) {
      const n = Number(idStr);
      if (Number.isFinite(n)) idSet.add(n);
    }
  }
  return [...idSet].sort((a, b) => a - b).join(",");
}
