/**
 * Fix calendar display mode initialization across pages that use the old pattern:
 *   const [effectiveDisplayMode, setEffectiveDisplayMode] = useState<"AD" | "BS">(initialMode);
 *
 * The fix:
 * 1. Import readCalendarDisplayMode from @/lib/calendarMode (if not already imported)
 * 2. Change the useState initializer to read from localStorage via readCalendarDisplayMode
 * 3. Add a useEffect to sync from CalendarSettingsContext once settings load (if page uses it)
 */

const fs = require('fs');
const path = require('path');

const FILES_TO_FIX = [
  'app/companies/[companyId]/reports/ledger/page.tsx',
  'app/companies/[companyId]/reports/bom-transactions/page.tsx',
  'app/companies/[companyId]/reports/customer-statement/page.tsx',
  'app/companies/[companyId]/reports/expenses-mix/page.tsx',
  'app/companies/[companyId]/reports/item-history/page.tsx',
  'app/companies/[companyId]/reports/item-wise-profit/page.tsx',
  'app/companies/[companyId]/reports/mis-fund-management/page.tsx',
  'app/companies/[companyId]/reports/performance-insights/page.tsx',
  'app/companies/[companyId]/reports/revenue-analytics/page.tsx',
  'app/companies/[companyId]/reports/sales-mix/page.tsx',
  'app/companies/[companyId]/reports/supplier-statement/page.tsx',
  'app/companies/[companyId]/reports/trial-balance/page.tsx',
  'app/companies/[companyId]/payroll/reports/vouchers/page.tsx',
];

const BASE = path.join(__dirname);

let fixed = 0;
let skipped = 0;

for (const rel of FILES_TO_FIX) {
  const filePath = path.join(BASE, rel);
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP (not found): ${rel}`);
    skipped++;
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // ── 1. Add readCalendarDisplayMode import if missing ──────────────────────
  const hasReadImport = content.includes('readCalendarDisplayMode');
  if (!hasReadImport) {
    // Check if there's already a @/lib/calendarMode import line
    const calendarModeImportRe = /import\s*\{([^}]+)\}\s*from\s*['"]@\/lib\/calendarMode['"]/;
    const existingImport = content.match(calendarModeImportRe);
    if (existingImport) {
      // Append to existing import
      content = content.replace(
        calendarModeImportRe,
        (m, p1) => `import { ${p1.trim()}, readCalendarDisplayMode } from '@/lib/calendarMode'`
      );
    } else {
      // Add new import after the last import from bsad or api
      const insertAfterRe = /(import\s+.*?from\s+['"]@\/lib\/bsad['"].*?\n)/;
      if (insertAfterRe.test(content)) {
        content = content.replace(insertAfterRe, (m) => m + `import { readCalendarDisplayMode } from '@/lib/calendarMode';\n`);
      } else {
        // fallback: insert after first import block
        const firstImportEnd = content.indexOf('\n\n');
        content = content.slice(0, firstImportEnd) + `\nimport { readCalendarDisplayMode } from '@/lib/calendarMode';` + content.slice(firstImportEnd);
      }
    }
    changed = true;
    console.log(`  [+] Added readCalendarDisplayMode import`);
  }

  // ── 2. Fix useState initializer ───────────────────────────────────────────
  // Pattern: useState<"AD" | "BS">(initialMode) OR useState<"AD" | "BS">(initialMode as any)
  const stateRe = /(\bconst\s+\[(\w+),\s*(\w+)\]\s*=\s*useState\s*<\s*"AD"\s*\|\s*"BS"\s*>\s*\()(\w+)(\s*(?:as\s+any\s*)?\))/g;
  
  content = content.replace(stateRe, (match, prefix, stateVar, setter, initVar, suffix) => {
    // Skip if already fixed (lazy initializer with function)
    if (match.includes('readCalendarDisplayMode')) return match;
    
    // Use lazy initializer
    const replacement = `${prefix.slice(0, prefix.lastIndexOf('('))}(() => {
      const _cc = typeof window !== 'undefined' ? (require('@/lib/api').getCurrentCompany?.() || null) : null;
      const _stored = readCalendarDisplayMode(_cc?.id ? String(_cc.id) : '', ${initVar} as "AD" | "BS");
      return (_stored === 'BOTH' ? (${initVar} as "AD" | "BS") : _stored) as "AD" | "BS";
    })`;
    changed = true;
    console.log(`  [~] Fixed useState initializer for ${stateVar}`);
    return replacement + suffix.slice(suffix.indexOf(')') + 1);
  });

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Fixed: ${rel}`);
    fixed++;
  } else {
    console.log(`-- No changes: ${rel}`);
    skipped++;
  }
}

console.log(`\nDone. Fixed: ${fixed}, Skipped/unchanged: ${skipped}`);
