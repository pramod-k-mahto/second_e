"use client";

import useSWR from "swr";
import { useParams } from "next/navigation";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { useMenuAccess } from "@/components/MenuPermissionsContext";
import * as api from "@/lib/api";

type TabState = "places" | "partners";

export default function DeliveryPlacesAndPartnersPage() {
    const params = useParams();
    const companyIdStr = params?.companyId as string;
    const companyId = companyIdStr ? Number(companyIdStr) : 0;

    const [activeTab, setActiveTab] = useState<TabState>("places");

    return (
        <div className="space-y-4">
            <PageHeader
                title="Delivery Configuration"
                subtitle="Manage delivery places, shipping charges, and courier partners"
            />

            <div className="flex border-b border-slate-200 dark:border-slate-800">
                <button
                    onClick={() => setActiveTab("places")}
                    className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${activeTab === "places"
                            ? "border-brand-600 text-brand-600 dark:border-brand-500 dark:text-brand-500"
                            : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-300"
                        }`}
                >
                    Delivery Places
                </button>
                <button
                    onClick={() => setActiveTab("partners")}
                    className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${activeTab === "partners"
                            ? "border-brand-600 text-brand-600 dark:border-brand-500 dark:text-brand-500"
                            : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-300"
                        }`}
                >
                    Delivery Partners
                </button>
            </div>

            <div className="pt-2">
                {activeTab === "places" ? (
                    <DeliveryPlacesTab companyId={companyId} />
                ) : (
                    <DeliveryPartnersTab companyId={companyId} />
                )}
            </div>
        </div>
    );
}

// ---------------------------------
// DELIVERY PLACES TAB
// ---------------------------------

function DeliveryPlacesTab({ companyId }: { companyId: number }) {
    const { canRead, canUpdate, canDelete } = useMenuAccess("inventory.warehouses"); // Re-using warehouse access

    const { data: places, mutate } = useSWR(
        companyId ? `/companies/${companyId}/delivery/places` : null,
        () => api.getDeliveryPlaces(companyId)
    );

    const [search, setSearch] = useState("");
    const [formOpen, setFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    const [name, setName] = useState("");
    const [shippingCharge, setShippingCharge] = useState("");
    const [isActive, setIsActive] = useState(true);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const filteredPlaces = useMemo(() => {
        if (!places) return [];
        if (!search) return places;
        const lower = search.toLowerCase();
        return places.filter(p => p.name.toLowerCase().includes(lower));
    }, [places, search]);

    const resetForm = () => {
        setEditingId(null);
        setName("");
        setShippingCharge("");
        setIsActive(true);
        setFormOpen(false);
        setError(null);
    };

    const startEdit = (p: api.DeliveryPlaceRead) => {
        setEditingId(p.id);
        setName(p.name);
        setShippingCharge(String(p.default_shipping_charge));
        setIsActive(p.is_active);
        setFormOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            setError("Name is required.");
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            if (editingId) {
                await api.updateDeliveryPlace(companyId, editingId, {
                    name,
                    default_shipping_charge: Number(shippingCharge) || 0,
                    is_active: isActive
                });
            } else {
                await api.createDeliveryPlace(companyId, {
                    name,
                    default_shipping_charge: Number(shippingCharge) || 0,
                    is_active: isActive
                });
            }
            await mutate();
            resetForm();
        } catch (err: any) {
            setError(api.getApiErrorMessage(err) || "Failed to save delivery place.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Are you sure you want to delete this delivery place?")) return;
        try {
            await api.deleteDeliveryPlace(companyId, id);
            await mutate();
        } catch (err: any) {
            alert(api.getApiErrorMessage(err) || "Failed to delete delivery place.");
        }
    };

    if (!canRead) {
        return <div className="p-4 text-sm text-red-600">Access Denied</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2 justify-between items-start sm:items-center">
                <Input
                    placeholder="Search delivery places..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full sm:max-w-xs"
                />
                {canUpdate && (
                    <Button onClick={() => setFormOpen(true)} className="w-full sm:w-auto">
                        Add Delivery Place
                    </Button>
                )}
            </div>

            {formOpen && (
                <div className="rounded-xl border bg-white p-4 shadow-sm animate-in fade-in zoom-in-95 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <h2 className="text-sm font-semibold mb-4 text-slate-800 dark:text-slate-200">
                        {editingId ? "Edit Delivery Place" : "New Delivery Place"}
                    </h2>

                    {error && <div className="mb-4 text-xs text-red-600 bg-red-50 p-2 rounded">{error}</div>}

                    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
                        <div>
                            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Name <span className="text-red-500">*</span>
                            </label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Kathmandu Valley"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Default Shipping Charge
                            </label>
                            <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={shippingCharge}
                                onChange={(e) => setShippingCharge(e.target.value)}
                                placeholder="0.00"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="isActivePlace"
                                checked={isActive}
                                onChange={(e) => setIsActive(e.target.checked)}
                                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            />
                            <label htmlFor="isActivePlace" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                                Active
                            </label>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <Button type="button" variant="outline" onClick={resetForm} disabled={submitting}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting ? "Saving..." : "Save"}
                            </Button>
                        </div>
                    </form>
                </div>
            )}

            <div className="rounded-xl border bg-white shadow-sm overflow-hidden dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase font-medium">
                            <tr>
                                <th className="px-4 py-3">Name</th>
                                <th className="px-4 py-3 text-right">Default Charge</th>
                                <th className="px-4 py-3 text-center">Status</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                            {filteredPlaces.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                                        No delivery places found.
                                    </td>
                                </tr>
                            ) : (
                                filteredPlaces.map(p => (
                                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="px-4 py-3 font-medium">{p.name}</td>
                                        <td className="px-4 py-3 text-right text-slate-500">
                                            {(p.default_shipping_charge ?? 0).toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${p.is_active
                                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400'
                                                : 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'
                                                }`}>
                                                {p.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {canUpdate && (
                                                <button
                                                    onClick={() => startEdit(p)}
                                                    className="text-brand-600 hover:text-brand-800 font-medium text-xs mr-3"
                                                >
                                                    Edit
                                                </button>
                                            )}
                                            {canDelete && (
                                                <button
                                                    onClick={() => handleDelete(p.id)}
                                                    className="text-rose-600 hover:text-rose-800 font-medium text-xs"
                                                >
                                                    Delete
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------
// DELIVERY PARTNERS TAB
// ---------------------------------

function DeliveryPartnersTab({ companyId }: { companyId: number }) {
    const { canRead, canUpdate, canDelete } = useMenuAccess("sales.customers");

    const { data: partners, mutate } = useSWR(
        companyId ? `/companies/${companyId}/delivery/partners` : null,
        () => api.getDeliveryPartners(companyId)
    );

    const [search, setSearch] = useState("");
    const [formOpen, setFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [vehicle, setVehicle] = useState("");
    const [isActive, setIsActive] = useState(true);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const filteredPartners = useMemo(() => {
        if (!partners) return [];
        if (!search) return partners;
        const lower = search.toLowerCase();
        return partners.filter(p => p.name.toLowerCase().includes(lower) || p.phone?.includes(lower));
    }, [partners, search]);

    const resetForm = () => {
        setEditingId(null);
        setName("");
        setPhone("");
        setVehicle("");
        setIsActive(true);
        setFormOpen(false);
        setError(null);
    };

    const startEdit = (p: api.DeliveryPartnerRead) => {
        setEditingId(p.id);
        setName(p.name);
        setPhone(p.phone || "");
        setVehicle(p.vehicle_number || "");
        setIsActive(p.is_active);
        setFormOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            setError("Name is required.");
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            if (editingId) {
                await api.updateDeliveryPartner(companyId, editingId, {
                    name, phone, vehicle_number: vehicle, is_active: isActive
                });
            } else {
                await api.createDeliveryPartner(companyId, {
                    name, phone, vehicle_number: vehicle, is_active: isActive
                });
            }
            await mutate();
            resetForm();
        } catch (err: any) {
            setError(api.getApiErrorMessage(err) || "Failed to save delivery partner.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Are you sure you want to delete this delivery partner?")) return;
        try {
            await api.deleteDeliveryPartner(companyId, id);
            await mutate();
        } catch (err: any) {
            alert(api.getApiErrorMessage(err) || "Failed to delete delivery partner.");
        }
    };

    if (!canRead) {
        return <div className="p-4 text-sm text-red-600">Access Denied</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2 justify-between items-start sm:items-center">
                <Input
                    placeholder="Search partners..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full sm:max-w-xs"
                />
                {canUpdate && (
                    <Button onClick={() => setFormOpen(true)} className="w-full sm:w-auto">
                        Add Delivery Partner
                    </Button>
                )}
            </div>

            {formOpen && (
                <div className="rounded-xl border bg-white p-4 shadow-sm animate-in fade-in zoom-in-95 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <h2 className="text-sm font-semibold mb-4 text-slate-800 dark:text-slate-200">
                        {editingId ? "Edit Delivery Partner" : "New Delivery Partner"}
                    </h2>

                    {error && <div className="mb-4 text-xs text-red-600 bg-red-50 p-2 rounded">{error}</div>}

                    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
                        <div>
                            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Name <span className="text-red-500">*</span>
                            </label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Partner or Rider Name"
                                required
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Phone
                                </label>
                                <Input
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="e.g. 98..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Vehicle No.
                                </label>
                                <Input
                                    value={vehicle}
                                    onChange={(e) => setVehicle(e.target.value)}
                                    placeholder="e.g. BA 1 PA..."
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="isActivePartner"
                                checked={isActive}
                                onChange={(e) => setIsActive(e.target.checked)}
                                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            />
                            <label htmlFor="isActivePartner" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                                Active
                            </label>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <Button type="button" variant="outline" onClick={resetForm} disabled={submitting}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting ? "Saving..." : "Save"}
                            </Button>
                        </div>
                    </form>
                </div>
            )}

            <div className="rounded-xl border bg-white shadow-sm overflow-hidden dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase font-medium">
                            <tr>
                                <th className="px-4 py-3">Partner Name</th>
                                <th className="px-4 py-3">Contact</th>
                                <th className="px-4 py-3 text-center">Status</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                            {filteredPartners.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                                        No delivery partners found.
                                    </td>
                                </tr>
                            ) : (
                                filteredPartners.map(p => (
                                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="px-4 py-3 font-medium">
                                            <div>{p.name}</div>
                                            <div className="text-[10px] text-slate-500 font-normal">Ledger ID: {p.ledger_id}</div>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 text-[13px]">
                                            <div>{p.phone || "-"}</div>
                                            <div className="text-[10px] text-slate-400">{p.vehicle_number}</div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${p.is_active
                                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400'
                                                : 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'
                                                }`}>
                                                {p.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {canUpdate && (
                                                <button
                                                    onClick={() => startEdit(p)}
                                                    className="text-brand-600 hover:text-brand-800 font-medium text-xs mr-3"
                                                >
                                                    Edit
                                                </button>
                                            )}
                                            {canDelete && (
                                                <button
                                                    onClick={() => handleDelete(p.id)}
                                                    className="text-rose-600 hover:text-rose-800 font-medium text-xs"
                                                >
                                                    Delete
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
