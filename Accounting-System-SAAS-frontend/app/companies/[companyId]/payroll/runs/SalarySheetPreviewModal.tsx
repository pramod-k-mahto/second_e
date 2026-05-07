import React, { useState, useEffect } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { useSalarySheetData, useUploadSalaryJson } from "@/lib/payroll/queries";
import { useToast } from "@/components/ui/Toast";
import { Loader2 } from "lucide-react";

export function SalarySheetPreviewModal({
  companyId,
  runId,
  open,
  onClose,
}: {
  companyId: number;
  runId: number | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading, refetch } = useSalarySheetData(companyId, runId);
  const upload = useUploadSalaryJson();
  const { showToast } = useToast();

  const [gridData, setGridData] = useState<{ headers: string[]; rows: any[][] }>({ headers: [], rows: [] });

  useEffect(() => {
    if (open && runId) {
      refetch();
    }
  }, [open, runId, refetch]);

  useEffect(() => {
    if (data) {
      setGridData(data as { headers: string[]; rows: any[][] });
    }
  }, [data]);

  const handleCellChange = (rowIndex: number, colIndex: number, val: string) => {
    setGridData((prev) => {
      const next = { ...prev };
      next.rows = [...prev.rows];
      next.rows[rowIndex] = [...next.rows[rowIndex]];
      next.rows[rowIndex][colIndex] = val;
      return next;
    });
  };

  const handleSave = async () => {
    if (!runId) return;
    try {
      await upload.mutateAsync({ companyId, runId, payload: gridData });
      showToast({ title: "Salary sheet updated successfully", variant: "success" });
      onClose();
    } catch (e: any) {
      showToast({ title: "Update failed", description: e.message || "An error occurred", variant: "error" });
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Preview & Update Salary Sheet"
      widthClassName="max-w-[95vw] w-full"
    >
      <div className="flex flex-col h-[80vh] space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
          </div>
        ) : (
          <div className="flex-1 overflow-auto border border-slate-200 dark:border-slate-800 rounded-md">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-10">
                <tr>
                  {gridData.headers.map((h, i) => (
                    <th
                      key={i}
                      className={`px-4 py-2 font-medium border-b border-r border-slate-200 dark:border-slate-700 whitespace-nowrap ${
                        h === "Net Amount"
                          ? "text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/20 text-right"
                          : "text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gridData.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    {row.map((cell, cIdx) => {
                      const isReadOnly = cIdx < 7; // ID, Name, Grade No., Designation, Dept, Proj, Seg
                      const isNetAmount = cIdx === row.length - 1 && gridData.headers[cIdx] === "Net Amount";
                      return (
                        <td key={cIdx} className={`p-0 border-r border-slate-100 dark:border-slate-800 ${isNetAmount ? "bg-brand-50 dark:bg-brand-900/20" : ""}`}>
                          {isReadOnly || isNetAmount ? (
                            <div className={`px-4 py-2 whitespace-nowrap ${isNetAmount ? "font-semibold text-brand-700 dark:text-brand-300 text-right min-w-[120px]" : "text-slate-500"}`}>
                              {isNetAmount && cell !== null && cell !== "" ? Number(cell).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : cell}
                            </div>
                          ) : (
                            <input
                              type="number"
                              className="w-full px-4 py-2 bg-transparent border-none focus:ring-1 focus:ring-brand-500 outline-none min-w-[100px]"
                              value={cell === null ? "" : cell}
                              onChange={(e) => handleCellChange(rIdx, cIdx, e.target.value)}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {gridData.rows.length === 0 && (
                  <tr>
                    <td colSpan={gridData.headers.length} className="px-4 py-8 text-center text-slate-500">
                      No employees found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose} disabled={upload.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} isLoading={upload.isPending} disabled={isLoading}>
            Save Changes
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
