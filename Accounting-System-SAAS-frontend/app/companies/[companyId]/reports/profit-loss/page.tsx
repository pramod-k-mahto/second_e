import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import {
  ProfitLossClient,
  type FinalAccountsResponse,
  type ProfitAndLossReport,
  type ProfitLossHierarchicalReport,
  type ProfitLossStructuredReport,
} from './ProfitLossClient';
import { ProfitLossFilters } from './ProfitLossFilters';

async function getAuthToken() {
  const cookieStore = await cookies();
  return cookieStore.get('auth_token')?.value ?? '';
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
    throw new Error(`Failed to fetch P&L (${res.status}): ${text}`);
  }

  return (await res.json()) as T;
}

type DepartmentRead = {
  id: number;
  name: string;
  is_active: boolean;
};

type ProjectRead = {
  id: number;
  name: string;
  is_active: boolean;
};

type SegmentRead = {
  id: number;
  name: string;
  is_active: boolean;
};

type PageProps = {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{
    from_date?: string;
    to_date?: string;
    on_date?: string;
    preset?: 'on_date' | 'today';
    view?: 'summary' | 'details' | 'hierarchical';
    project_id?: string;
    segment_id?: string;
    employee_id?: string;
    current_preset?: 'on_date' | 'today';
  }>;
};

export default async function ProfitLossPage(props: PageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { companyId } = params;
  const today = formatDate(new Date());

  const rawFrom = searchParams?.from_date;
  const rawTo = searchParams?.to_date;
  const rawOn = searchParams?.on_date;
  // Fallback to current_preset if preset is not explicitly clicked
  const preset = searchParams?.preset || searchParams?.current_preset;

  const departmentId = searchParams?.department_id;
  const projectId = searchParams?.project_id;
  const segmentId = searchParams?.segment_id;
  const employeeId = searchParams?.employee_id;

  let company: any = null;
  try {
    company = await fetchJson<any>(`/companies/${encodeURIComponent(companyId)}`);
  } catch (e) {
    console.error('Failed to fetch company details:', e);
  }

  const fiscalYearStart = company?.fiscal_year_start || today;

  let from = rawFrom || '';
  let to = rawTo || '';

  if (rawOn) {
    from = rawOn;
    to = rawOn;
  } else if (preset === 'today') {
    const currentDate = new Date().toISOString().slice(0, 10);
    const fyStart = company?.fiscal_year_start;
    const fyEnd = company?.fiscal_year_end;

    from = fyStart || today;
    
    // Clamp to today if today is within FY, otherwise clamp to FY end
    if (fyEnd && currentDate > fyEnd) {
      to = fyEnd;
    } else {
      to = currentDate;
    }
  }
  const view =
    (searchParams.view as 'summary' | 'details' | 'hierarchical') || 'summary';

  let summary: FinalAccountsResponse | null = null;
  const details: ProfitAndLossReport | null = null;
  let hierarchical: ProfitLossHierarchicalReport | null = null;
  let error: string | null = null;
  let departments: DepartmentRead[] = [];
  let projects: ProjectRead[] = [];
  let segments: SegmentRead[] = [];
  let employees: any[] = [];

  try {
    departments = await fetchJson<DepartmentRead[]>(
      `/companies/${encodeURIComponent(companyId)}/departments`
    );
    projects = await fetchJson<ProjectRead[]>(
      `/companies/${encodeURIComponent(companyId)}/projects`
    );
    segments = await fetchJson<SegmentRead[]>(
      `/companies/${encodeURIComponent(companyId)}/segments`
    );
    try {
      employees = await fetchJson<any[]>(
        `/payroll/companies/${encodeURIComponent(companyId)}/employees`
      );
    } catch (e) {
      console.error('Failed to fetch employees:', e);
    }

    const ccParams =
      (departmentId ? `&department_id=${encodeURIComponent(departmentId)}` : '') +
      (projectId ? `&project_id=${encodeURIComponent(projectId)}` : '') +
      (segmentId ? `&segment_id=${encodeURIComponent(segmentId)}` : '') +
      (employeeId ? `&employee_id=${encodeURIComponent(employeeId)}` : '');

    if (from && to) {
      if (view === 'details') {
        // Backend now returns pre-balanced Trading + Profit & Loss blocks.
        summary = await fetchJson<FinalAccountsResponse>(
          `/reports/final-accounts?company_id=${encodeURIComponent(
            companyId
          )}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${ccParams}`
        );
      } else if (view === 'summary' || view === 'hierarchical') {
        hierarchical = await fetchJson<ProfitLossHierarchicalReport>(
          `/companies/${encodeURIComponent(
            companyId
          )}/reports/profit-and-loss-hierarchical?from_date=${encodeURIComponent(
            from
          )}&to_date=${encodeURIComponent(to)}${ccParams}`
        );
      }
    }
  } catch (e: any) {
    error = e?.message ?? 'Failed to load Profit & Loss report.';
  }

  const activeDepartments = (departments || []).filter((d) => d.is_active);
  const activeProjects = (projects || []).filter((p) => p.is_active);
  const activeSegments = (segments || []).filter((s) => s.is_active);

  return (
    <div className="space-y-4">
      <div className="print-hidden">
        <ProfitLossFilters
          companyId={companyId}
          departments={activeDepartments}
          projects={activeProjects}
          segments={activeSegments}
          employees={employees || []}
          currentFrom={from}
          currentTo={to}
        />
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {!error && (
        <ProfitLossClient
          companyId={companyId}
          from={from}
          to={to}
          view={view}
          summary={summary}
          details={details}
          hierarchical={hierarchical}
          error={error}
        />
      )}
    </div>
  );
}
