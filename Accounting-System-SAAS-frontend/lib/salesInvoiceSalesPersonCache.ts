/**
 * Persistence for sales person selections that exceed the backend's single-column limit.
 * Used to preserve multi-select (CSV) state in the UI across sessions/reloads for a specific invoice.
 */

export type SalesInvoiceSalesPersonCacheData = {
  salesPersonColumnMode: "invoice" | "product" | null;
  headerCsv: string;
  lineCsvs: string[];
  manuals?: Record<string, string>;
};

const CACHE_PREFIX = "sales_person_cache_";

function getCacheKey(companyId: string | number, invoiceId: string | number): string {
  return `${CACHE_PREFIX}${companyId}_${invoiceId}`;
}

/**
 * Saves the current sales person UI state for an invoice to localStorage.
 */
export function saveSalesInvoiceSalesPersonCache(
  companyId: string | number,
  invoiceId: string | number,
  data: SalesInvoiceSalesPersonCacheData
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getCacheKey(companyId, invoiceId), JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save sales person cache", e);
  }
}

/**
 * Merges the API's invoice state with any cached multi-select data from localStorage.
 * If cached data is found, it overrides the header and lines' sales_person_id fields.
 */
export function mergeInvoiceSalesPersonStateFromCache(
  companyId: string | number,
  invoiceId: string | number,
  apiHeaderCsv: string,
  apiLines: any[]
) {
  const result = {
    header: apiHeaderCsv,
    lines: [...apiLines],
    salesPersonColumnMode: null as "invoice" | "product" | null,
    manuals: {} as Record<string, string>,
  };

  if (typeof window === "undefined") return result;

  const raw = localStorage.getItem(getCacheKey(companyId, invoiceId));
  if (!raw) return result;

  try {
    const cached = JSON.parse(raw) as SalesInvoiceSalesPersonCacheData;

    // Favor cached header CSV if available
    if (cached.headerCsv) {
      result.header = cached.headerCsv;
    }

    if (cached.salesPersonColumnMode) {
      result.salesPersonColumnMode = cached.salesPersonColumnMode;
    }

    // Map cached line CSVs back to the API lines by index
    if (Array.isArray(cached.lineCsvs)) {
      result.lines = apiLines.map((line, idx) => {
        const cachedCsv = cached.lineCsvs[idx];
        if (cachedCsv) {
          return { ...line, sales_person_id: cachedCsv };
        }
        return line;
      });
    }
    if (cached.manuals) {
      result.manuals = cached.manuals;
    }

    return result;
  } catch (e) {
    console.warn("Failed to parse sales person cache for invoice", invoiceId, e);
    return result;
  }
}
