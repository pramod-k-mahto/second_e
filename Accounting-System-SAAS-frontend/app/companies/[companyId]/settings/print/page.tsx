"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type PaperSize = "A4" | "A5" | "Letter";
type Orientation = "Portrait" | "Landscape";

export default function CompanyPrintSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;

  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const [orientation, setOrientation] = useState<Orientation>("Portrait");
  const [showLogo, setShowLogo] = useState(true);
  const [footerNote, setFooterNote] = useState("");
  const [marginTop, setMarginTop] = useState(10);
  const [marginRight, setMarginRight] = useState(10);
  const [marginBottom, setMarginBottom] = useState(10);
  const [marginLeft, setMarginLeft] = useState(10);
  const [isEditing, setIsEditing] = useState(false);

  const previewStyle = useMemo(() => {
    const baseWidth = paperSize === "A5" ? 420 : paperSize === "Letter" ? 510 : 520;
    const baseHeight = paperSize === "A5" ? 595 : paperSize === "Letter" ? 660 : 740;
    const width = orientation === "Landscape" ? baseHeight : baseWidth;
    const height = orientation === "Landscape" ? baseWidth : baseHeight;

    return {
      width,
      height,
      paddingTop: marginTop,
      paddingRight: marginRight,
      paddingBottom: marginBottom,
      paddingLeft: marginLeft,
    } as const;
  }, [paperSize, orientation, marginTop, marginRight, marginBottom, marginLeft]);

  return (
    <div className="space-y-6 text-sm">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6">
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0v-2.1c0-.996.804-1.8 1.8-1.8h6.9c.996 0 1.8.804 1.8 1.8v2.1z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Print Settings</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Configure formatting and options for printing documents.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all duration-150 flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Modify
              </button>
            )}
            {isEditing && (
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                }}
                className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
              >
                Cancel
              </button>
            )}
            {isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all duration-150"
              >
                Save
              </button>
            )}
            <button
              type="button"
              onClick={() => router.back()}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 text-xs font-bold shadow-sm transition-all duration-150 flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Close
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <fieldset disabled={!isEditing} className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1">
              <div className="text-xs font-medium text-slate-700">Paper size</div>
              <select
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={paperSize}
                onChange={(e) => setPaperSize(e.target.value as PaperSize)}
              >
                <option value="A4">A4</option>
                <option value="A5">A5</option>
                <option value="Letter">Letter</option>
              </select>
            </label>

            <label className="space-y-1">
              <div className="text-xs font-medium text-slate-700">Orientation</div>
              <select
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={orientation}
                onChange={(e) => setOrientation(e.target.value as Orientation)}
              >
                <option value="Portrait">Portrait</option>
                <option value="Landscape">Landscape</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="space-y-1">
              <div className="text-xs font-medium text-slate-700">Top (mm)</div>
              <input
                type="number"
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={marginTop}
                min={0}
                onChange={(e) => setMarginTop(Number(e.target.value))}
              />
            </label>
            <label className="space-y-1">
              <div className="text-xs font-medium text-slate-700">Right (mm)</div>
              <input
                type="number"
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={marginRight}
                min={0}
                onChange={(e) => setMarginRight(Number(e.target.value))}
              />
            </label>
            <label className="space-y-1">
              <div className="text-xs font-medium text-slate-700">Bottom (mm)</div>
              <input
                type="number"
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={marginBottom}
                min={0}
                onChange={(e) => setMarginBottom(Number(e.target.value))}
              />
            </label>
            <label className="space-y-1">
              <div className="text-xs font-medium text-slate-700">Left (mm)</div>
              <input
                type="number"
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={marginLeft}
                min={0}
                onChange={(e) => setMarginLeft(Number(e.target.value))}
              />
            </label>
          </div>

          <label className="flex items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={showLogo}
              onChange={(e) => setShowLogo(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm text-slate-800">Show company logo on print</span>
          </label>

          <label className="space-y-1">
            <div className="text-xs font-medium text-slate-700">Footer note</div>
            <input
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              value={footerNote}
              onChange={(e) => setFooterNote(e.target.value)}
              placeholder="e.g. This is a system generated document"
            />
          </label>

          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This page currently saves settings locally (UI only). If you want, I can wire it to your backend/company settings API.
          </div>
        </fieldset>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-700 mb-3">Preview</div>
          <div className="overflow-auto">
            <div
              className="border border-slate-300 bg-white shadow-sm mx-auto"
              style={{
                width: previewStyle.width,
                height: previewStyle.height,
                paddingTop: previewStyle.paddingTop,
                paddingRight: previewStyle.paddingRight,
                paddingBottom: previewStyle.paddingBottom,
                paddingLeft: previewStyle.paddingLeft,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Invoice</div>
                  <div className="text-[11px] text-slate-600">Company: {companyId}</div>
                </div>
                {showLogo && (
                  <div className="h-10 w-24 rounded border border-slate-200 bg-slate-50 flex items-center justify-center text-[10px] text-slate-500">
                    Logo
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-2">
                <div className="h-3 w-2/3 bg-slate-100 rounded" />
                <div className="h-3 w-1/2 bg-slate-100 rounded" />
                <div className="h-3 w-3/4 bg-slate-100 rounded" />
              </div>

              <div className="mt-6 border-t border-slate-200 pt-2 text-[10px] text-slate-600 flex justify-between">
                <span>{footerNote || ""}</span>
                <span>
                  {paperSize} / {orientation}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
