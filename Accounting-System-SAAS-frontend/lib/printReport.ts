/**
 * Shared print utility for all report pages.
 * Opens a beautifully styled print preview window.
 */

export interface PrintReportOptions {
  /** Inner HTML of the content to print */
  contentHtml: string;
  /** Report title, e.g. "Daybook" */
  title: string;
  /** Company name */
  company?: string;
  /** Address / tag line */
  subtitle?: string;
  /** Period label, e.g. "01 Apr 2025 – 06 Apr 2026" */
  period?: string;
  /** Extra label shown as a small pill next to the title */
  badge?: string;
  /** Page orientation */
  orientation?: "portrait" | "landscape";
  /** Applied calendar logic, e.g. "AD" or "BS" */
  calendarSystem?: "AD" | "BS";
  /** Automatically open the browser print dialog when the preview loads */
  autoPrint?: boolean;
}

const PRINT_CSS = `
  *, *::before, *::after { box-sizing: border-box; }

  @page {
    size: A4 var(--page-orientation, portrait);
    margin: 8mm 10mm 10mm 10mm;
  }

  :root { --page-orientation: portrait; }

  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 10px;
    color: #1e293b;
    background: #fff;
    margin: 0;
    padding: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Toolbar (screen only) ── */
  .pv-toolbar {
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 20px;
    background: #1e293b;
    box-shadow: 0 2px 10px rgba(0,0,0,.3);
    font-family: 'Segoe UI', Arial, sans-serif;
  }
  .pv-toolbar span {
    font-size: 13px;
    font-weight: 600;
    color: #f8fafc;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pv-btn {
    padding: 7px 18px;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background .15s;
    white-space: nowrap;
  }
  .pv-btn-print { background: #6366f1; color: #fff; }
  .pv-btn-print:hover { background: #4f46e5; }
  .pv-btn-download { background: #10b981; color: #fff; }
  .pv-btn-download:hover { background: #059669; }
  .pv-btn-close  { background: #ef4444; color: #fff; }
  .pv-btn-close:hover  { background: #dc2626; }
  @media print { .pv-toolbar { display: none !important; } }

  /* ── Page wrapper ── */
  .pv-page {
    padding: 20px 24px 16px;
    min-height: 100vh;
  }
  @media screen {
    body { background: #f1f5f9; }
    .pv-page {
      max-width: var(--preview-width, 860px);
      margin: 72px auto 40px;
      background: #fff;
      border-radius: 10px;
      box-shadow: 0 4px 32px rgba(0,0,0,.12);
    }
  }

  /* ── Report header ── */
  .pv-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding-bottom: 12px;
    border-bottom: 2px solid #6366f1;
    margin-bottom: 14px;
    gap: 16px;
  }
  .pv-header-left h1 {
    margin: 0 0 2px;
    font-size: 18px;
    font-weight: 700;
    color: #1e293b;
    letter-spacing: -.3px;
  }
  .pv-header-left .pv-company {
    font-size: 12px;
    font-weight: 600;
    color: #6366f1;
    margin: 0 0 1px;
  }
  .pv-header-left .pv-subtitle {
    font-size: 10.5px;
    color: #64748b;
    margin: 0;
  }
  .pv-header-right {
    text-align: right;
    flex-shrink: 0;
  }
  .pv-badge {
    display: inline-block;
    background: #ede9fe;
    color: #5b21b6;
    font-size: 10px;
    font-weight: 600;
    border-radius: 20px;
    padding: 2px 10px;
    margin-bottom: 4px;
    letter-spacing: .3px;
  }
  .pv-period {
    font-size: 11px;
    color: #334155;
    font-weight: 600;
  }
  .pv-printed-on {
    font-size: 9.5px;
    color: #94a3b8;
    margin-top: 3px;
  }

  /* ── Tables ── */
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 9px;
    page-break-inside: auto;
    table-layout: auto;
  }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr { page-break-inside: avoid; }

  th {
    background: #f1f5f9 !important;
    color: #374151;
    font-weight: 700;
    text-align: left;
    padding: 4px 6px;
    border: 1px solid #e2e8f0;
    font-size: 8.5px;
    letter-spacing: .1px;
    white-space: nowrap;
  }
  td {
    padding: 4px 6px;
    border: 1px solid #e2e8f0;
    color: #1e293b;
    vertical-align: middle;
  }
  tr:nth-child(even) td { background: #f8fafc !important; }
  tr:hover td { background: #f0f9ff !important; }

  tfoot td, tfoot th {
    background: #f1f5f9 !important;
    font-weight: 700;
    border-top: 2px solid #94a3b8;
  }

  /* ── Group / hierarchy rows ── */
  .print-group-row td, .print-group-row th {
    background: #e8edf4 !important;
    font-weight: 700;
    color: #1e293b;
  }
  .print-total-row td {
    background: #f1f5f9 !important;
    font-weight: 700;
    border-top: 2px solid #6366f1;
    color: #1e293b;
  }
  .print-grand-total td {
    background: #6366f1 !important;
    color: #fff !important;
    font-weight: 700;
    border-top: 2px solid #4f46e5;
  }

  /* ── Charts & Graphics ── */
  .chart-print-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    margin: 20px 0;
    page-break-inside: avoid;
  }
  .chart-print-container svg {
    margin: 0 auto !important;
    display: block !important;
  }
  .recharts-responsive-container {
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
  }

  /* ── Structured Legend (1-2 Columns) ── */
  .legend-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    width: 100%;
    max-width: 600px;
    margin: 15px auto 0;
    padding: 10px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 9px;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
    overflow: hidden;
  }
  .legend-swatch {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .legend-value {
    margin-left: auto;
    font-family: monospace;
    color: #1e293b;
  }

  /* ── Utility ── */
  .print-center { display: flex; justify-content: center; align-items: center; text-align: center; }
  .print-w-full { width: 100% !important; }
  .mt-4 { margin-top: 16px !important; }
  .mb-4 { margin-bottom: 16px !important; }

  .text-right { text-align: right !important; }
  .text-center { text-align: center !important; }
  .font-bold { font-weight: 700 !important; }
  .text-green { color: #16a34a !important; }
  .text-red   { color: #dc2626 !important; }
  .text-muted { color: #64748b !important; }
  .tabular-nums { font-variant-numeric: tabular-nums; }

  /* Hide screen-only elements */
  .no-print, .print-hidden, button, input, select,
  [data-print-hide], nav, aside, header { display: none !important; }

  /* ── Footer ── */
  .pv-footer {
    margin-top: 18px;
    padding-top: 8px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 9px;
    color: #94a3b8;
  }
  .pv-footer strong { color: #64748b; }

  /* ── Charts: Ensure SVGs align ── */
  svg.recharts-surface { max-width: 100%; margin: 0 auto; }
`;

function buildHeader(opts: PrintReportOptions): string {
  const now = new Date();
  const printed = now.toLocaleDateString(undefined, {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
  }) + " " + now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return `
    <div class="pv-header">
      <div class="pv-header-left">
        ${opts.company ? `<p class="pv-company">${opts.company}</p>` : ""}
        <h1>${opts.title}</h1>
        ${opts.subtitle ? `<p class="pv-subtitle">${opts.subtitle}</p>` : ""}
      </div>
      <div class="pv-header-right">
        ${opts.badge ? `<div class="pv-badge">${opts.badge}</div>` : ""}
        ${opts.calendarSystem ? `<div class="pv-badge" style="background:#f1f5f9; color:#475569; border:1px solid #e2e8f0;">${opts.calendarSystem} CALENDAR</div>` : ""}
        ${opts.period ? `<div class="pv-period">${opts.period}</div>` : ""}
        <div class="pv-printed-on">Printed: ${printed}</div>
      </div>
    </div>
  `;
}

function buildFooter(opts: PrintReportOptions): string {
  return `
    <div class="pv-footer">
      <span><strong>${opts.company || "Report"}</strong> — ${opts.title}</span>
      <span>Generated by Prixna ERP Pro</span>
    </div>
  `;
}

/**
 * Open a beautiful branded print preview in a new window.
 */
export function openPrintWindow(opts: PrintReportOptions): void {
  if (typeof window === "undefined") return;

  const orientationCss = opts.orientation === "landscape"
    ? `<style>:root{--page-orientation:landscape; --preview-width: 1100px;} @page{size:A4 landscape;}</style>`
    : `<style>:root{--preview-width: 860px;}</style>`;

  const win = window.open("", "_blank");
  if (!win) {
    // Fallback if popup blocked
    window.print();
    return;
  }

  win.document.open();
  win.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${opts.title}${opts.company ? " — " + opts.company : ""}</title>
  <style>${PRINT_CSS}</style>
  ${orientationCss}
</head>
<body>
  <div class="pv-toolbar">
    <span>${opts.title}${opts.period ? " · " + opts.period : ""}</span>
    <button class="pv-btn pv-btn-print" onclick="window.print()" style="font-size:13px; padding:8px 22px;">
      🖨&nbsp; Print
    </button>
    <button class="pv-btn pv-btn-download" onclick="exportToCSV()">📥 Download CSV</button>
    <button class="pv-btn pv-btn-close" onclick="window.close()">✕ Close</button>
  </div>
  <script>
    function exportToCSV() {
      const rows = document.querySelectorAll('table tr');
      let csv = [];
      for (let i = 0; i < rows.length; i++) {
        const row = [], cols = rows[i].querySelectorAll('td, th');
        for (let j = 0; j < cols.length; j++) {
          let data = cols[j].innerText.replace(/(\\r\\n|\\n|\\r)/gm, '').replace(/(\\s\\s+)/gm, ' ');
          data = data.replace(/"/g, '""');
          row.push('"' + data + '"');
        }
        csv.push(row.join(','));
      }
      const csvContent = "data:text/csv;charset=utf-8," + csv.join("\\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", "${opts.title.replace(/\s+/g, '_')}_Report.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    ${opts.autoPrint ? "window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 400); });" : ""}
  </script>
  <div class="pv-page">
    ${buildHeader(opts)}
    <div class="pv-content">
      ${opts.contentHtml}
    </div>
    ${buildFooter(opts)}
  </div>
</body>
</html>`);
  win.document.close();
  win.focus();
}

/**
 * Convenience: extract inner HTML from a ref and open print window.
 */
export function printFromRef(
  ref: React.RefObject<HTMLElement | null>,
  opts: Omit<PrintReportOptions, "contentHtml">
): void {
  const html = ref.current?.innerHTML ?? "";
  openPrintWindow({ ...opts, contentHtml: html });
}
