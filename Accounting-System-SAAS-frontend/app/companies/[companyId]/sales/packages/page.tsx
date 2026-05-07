"use client";

import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { PageHeader } from "@/components/ui/PageHeader";
import { useMenuAccess } from "@/components/MenuPermissionsContext";
import * as api from "@/lib/api";

// ---------------------------------

export default function PackagesPage() {
    const router = useRouter();
    const params = useParams();
    const companyIdStr = params?.companyId as string;
    const companyId = companyIdStr ? Number(companyIdStr) : 0;

    const { canRead, canUpdate } = useMenuAccess("sales.invoices"); // Re-using invoice access

    const { data: packages, mutate } = useSWR(
        companyId ? `/companies/${companyId}/delivery/packages` : null,
        () => api.getPackages(companyId)
    );

    const { data: partners } = useSWR(
        companyId ? `/companies/${companyId}/delivery/partners` : null,
        () => api.getDeliveryPartners(companyId)
    );

    const { data: places } = useSWR(
        companyId ? `/companies/${companyId}/delivery/places` : null,
        () => api.getDeliveryPlaces(companyId)
    );

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [partnerFilter, setPartnerFilter] = useState("ALL");

    const [codModalOpen, setCodModalOpen] = useState(false);
    const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);
    const [codReceivedAmount, setCodReceivedAmount] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const filteredPackages = useMemo(() => {
        if (!packages) return [];
        return packages.filter(p => {
            const matchSearch = String(p.invoice_id).includes(search) || (p.tracking_number?.toLowerCase() || "").includes(search.toLowerCase());
            const matchStatus = statusFilter === "ALL" || p.status === statusFilter;
            const matchPartner = partnerFilter === "ALL" || String(p.delivery_partner_id) === partnerFilter;
            return matchSearch && matchStatus && matchPartner;
        }).sort((a, b) => b.id - a.id);
    }, [packages, search, statusFilter, partnerFilter]);

    const handleUpdateStatus = async (id: number, status: api.PackageStatus) => {
        if (!confirm(`Mark package as ${status}?`)) return;
        try {
            await api.updatePackage(companyId, id, { status });
            await mutate();
        } catch (err: any) {
            alert(api.getApiErrorMessage(err) || "Failed to update status.");
        }
    };

    const openCodModal = (pkg: api.PackageRead) => {
        setSelectedPackageId(pkg.id);
        setCodReceivedAmount(String(pkg.cod_amount));
        setCodModalOpen(true);
    };

    const handleReceiveCod = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPackageId) return;

        setSubmitting(true);
        try {
            await api.receivePackageCOD(companyId, selectedPackageId, Number(codReceivedAmount) || 0);
            await mutate();
            setCodModalOpen(false);
            setSelectedPackageId(null);
            setCodReceivedAmount("");
        } catch (err: any) {
            alert(api.getApiErrorMessage(err) || "Failed to receive COD.");
        } finally {
            setSubmitting(false);
        }
    };

    if (!canRead) {
        return <div className="p-4 text-sm text-red-600">Access Denied</div>;
    }

    return (
        <div className="space-y-4">
            <PageHeader
                title="Packages & Dispatches"
                subtitle="Track deliveries and manage Cash on Delivery (COD)"
                closeLink="/dashboard"
                actions={
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => router.back()}
                        className="rounded-xl border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all font-semibold"
                    >
                        ← Back
                    </Button>
                }
            />

            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm dark:bg-slate-900 dark:border-slate-800">
                <Input
                    placeholder="Search Invoice or Tracking..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full sm:w-64"
                />
                <Select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full sm:w-40"
                >
                    <option value="ALL">All Statuses</option>
                    <option value="PENDING">Pending</option>
                    <option value="DISPATCHED">Dispatched</option>
                    <option value="DELIVERED">Delivered</option>
                    <option value="RETURNED">Returned</option>
                </Select>
                <Select
                    value={partnerFilter}
                    onChange={(e) => setPartnerFilter(e.target.value)}
                    className="w-full sm:w-48"
                >
                    <option value="ALL">All Partners</option>
                    {(partners || []).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </Select>
            </div>

            <div className="rounded-xl border bg-white shadow-sm overflow-hidden dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase font-medium">
                            <tr>
                                <th className="px-4 py-3">Package ID</th>
                                <th className="px-4 py-3">Tracking / Inv.</th>
                                <th className="px-4 py-3">Partner & Place</th>
                                <th className="px-4 py-3 text-center">Status</th>
                                <th className="px-4 py-3 text-right">Pending COD</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                            {filteredPackages.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                                        No packages found.
                                    </td>
                                </tr>
                            ) : (
                                filteredPackages.map(p => {
                                    const partnerName = (partners || []).find(x => x.id === p.delivery_partner_id)?.name || "Unknown";
                                    const placeName = (places || []).find(x => x.id === p.delivery_place_id)?.name || "Unknown";

                                    return (
                                        <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                            <td className="px-4 py-3 font-medium">PKG-{p.id}</td>
                                            <td className="px-4 py-3">
                                                <div className="font-semibold">{p.tracking_number}</div>
                                                <div className="text-[10px] text-slate-500 hover:text-indigo-600 cursor-pointer">
                                                    Inv #{p.invoice_id}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-[13px]">{partnerName}</div>
                                                <div className="text-[10px] text-slate-400 bg-slate-100 inline-block px-1.5 py-0.5 rounded mt-0.5">{placeName}</div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <select
                                                    value={p.status}
                                                    onChange={(e) => handleUpdateStatus(p.id, e.target.value as any)}
                                                    disabled={!canUpdate}
                                                    className={`text-[11px] font-bold uppercase rounded px-2 py-1 border outline-none cursor-pointer ${p.status === 'DELIVERED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                        p.status === 'DISPATCHED' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                            p.status === 'RETURNED' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                                                'bg-amber-50 text-amber-700 border-amber-200'
                                                        }`}
                                                >
                                                    <option value="PENDING">Pending</option>
                                                    <option value="DISPATCHED">Dispatched</option>
                                                    <option value="DELIVERED">Delivered</option>
                                                    <option value="RETURNED">Returned</option>
                                                </select>
                                            </td>
                                            <td className="px-4 py-3 text-right font-medium">
                                                {p.cod_amount > 0 ? (
                                                    <span className="text-rose-600">{p.cod_amount.toFixed(2)}</span>
                                                ) : (
                                                    <span className="text-slate-400">0.00</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {canUpdate && p.cod_amount > 0 && (
                                                    <button
                                                        onClick={() => openCodModal(p)}
                                                        className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-1 rounded text-[11px] font-semibold hover:bg-indigo-100 transition-colors"
                                                    >
                                                        Receive COD
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {codModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Receive COD Payment</h3>
                        <form onSubmit={handleReceiveCod} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Amount Received
                                </label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    value={codReceivedAmount}
                                    onChange={(e) => setCodReceivedAmount(e.target.value)}
                                    required
                                />
                                <p className="text-[10px] text-slate-500 mt-1">This will debit Cash/Bank and credit the Delivery Partner&apos;s ledger.</p>
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button type="button" variant="outline" onClick={() => setCodModalOpen(false)} disabled={submitting}>Cancel</Button>
                                <Button type="submit" disabled={submitting}>{submitting ? "Processing..." : "Confirm Receipt"}</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
