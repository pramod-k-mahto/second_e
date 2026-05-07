import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { BalanceSheetClient } from './BalanceSheetClient';

type LedgerGroupType = 'ASSET' | 'LIABILITY';

// Flat summary report (existing API)
type BalanceSheetRow = {
  group_name: string;
  amount: number;
  group_type: LedgerGroupType;
};

type BalanceSheetReport = {
  as_on_date: string;
  rows: BalanceSheetRow[];
};

// Hierarchical detailed report (new API)
type BalanceSheetHierarchicalRow = {
  row_type?: 'GROUP' | 'SUB_GROUP' | 'LEDGER' | 'TOTAL';
  level?: number;
  is_group?: boolean;
  is_ledger?: boolean;
  group_id?: number | null;
  group_name?: string | null;
  primary_group?: string | null;
  group_path?: string[];
  parent_group_id?: number | null;
  parent_group_name?: string | null;
  sort_order?: number | null;

  ledger_id?: number | null;
  ledger_name: string;
  amount: number;
};

type BalanceSheetHierarchicalReport = {
  as_on_date: string;
  liabilities: BalanceSheetHierarchicalRow[];
  assets: BalanceSheetHierarchicalRow[];
  totals: {
    liabilities_total: number;
    assets_total: number;
  };
};

async function getAuthToken() {
  const cookieStore = await cookies();
  return cookieStore.get('auth_token')?.value ?? '';
}

function formatAmount(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function defaultAsOnDate() {
  return formatDate(new Date());
}

async function fetchJson<T>(path: string): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE;
  if (!base) throw new Error('API base URL is not configured');

  const token = await getAuthToken();
  const res = await fetch(`${base}${path}`, {
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (res.status === 404) notFound();
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch Balance Sheet (${res.status}): ${text}`);
  }

  return (await res.json()) as T;
}

type PageProps = {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{
    as_on_date?: string;
    from_date?: string;
    to_date?: string;
    on_date?: string;
    preset?: 'on_date' | 'today';
    view?: 'summary' | 'details' | 'hierarchical';
  }>;
};

export default async function BalanceSheetPage(props: PageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { companyId } = params;

  const today = defaultAsOnDate();
  const baseAsOn = searchParams.as_on_date;
  const rawFrom = searchParams.from_date;
  const rawTo = searchParams.to_date;
  const rawOn = searchParams.on_date;
  const preset = searchParams.preset;

  let asOn = baseAsOn || today;

  let company: any = null;
  try {
    company = await fetchJson<any>(`/companies/${encodeURIComponent(companyId)}`);
  } catch (e) {
    console.error('Failed to fetch company details:', e);
  }

  const fyStart = company?.fiscal_year_start || today;
  const fyEnd = company?.fiscal_year_end || today;

  if (preset === 'on_date' && rawOn) {
    asOn = rawOn;
  } else if (preset === 'today' || !baseAsOn) {
    // Default to today but clamp to fyEnd
    const currentDate = new Date().toISOString().slice(0, 10);
    if (fyEnd && currentDate > fyEnd) {
      asOn = fyEnd;
    } else {
      asOn = currentDate;
    }
  } else if (rawTo) {
    asOn = rawTo;
  } else if (rawFrom) {
    asOn = rawFrom;
  }
  const view =
    (searchParams.view as 'summary' | 'details' | 'hierarchical') || 'summary';

  let hierarchical: BalanceSheetHierarchicalReport | null = null;
  let summary: BalanceSheetReport | null = null;
  let error: string | null = null;

  try {
    if (view === 'details' || view === 'hierarchical') {
      hierarchical = await fetchJson<BalanceSheetHierarchicalReport>(
        `/companies/${encodeURIComponent(
          companyId
        )}/reports/balance-sheet-hierarchical?as_on_date=${encodeURIComponent(asOn)}`
      );
    } else {
      summary = await fetchJson<BalanceSheetReport>(
        `/companies/${encodeURIComponent(
          companyId
        )}/reports/balance-sheet?as_on_date=${encodeURIComponent(asOn)}`
      );
    }
  } catch (e: any) {
    error = e?.message ?? 'Failed to load Balance Sheet.';
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      <BalanceSheetClient
        companyId={companyId}
        asOn={asOn}
        view={view}
        fromDate={rawFrom || ''}
        toDate={rawTo || ''}
        onDate={rawOn || ''}
        preset={preset}
        fiscalYearStart={fyStart}
        hierarchical={hierarchical}
        summary={summary}
        error={error}
      />
    </div>
  );
}
