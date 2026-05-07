"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCart } from "./CartProvider";

type Item = {
    id: number;
    name: string;
    description?: string;
    image_url?: string;
    mrp?: number;
    default_sales_rate?: number;
    default_tax_rate?: number;
    delivery_charge?: number | null;
};

function ProductImageFallback({ url, name }: { url: string; name: string }) {
    const [errored, setErrored] = useState(false);

    if (errored || !url) {
        return (
            <div className="w-full h-full bg-indigo-50/50 flex flex-col items-center justify-center text-indigo-200">
                <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
            </div>
        );
    }

    return (
        <img
            src={url}
            alt={name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={() => setErrored(true)}
            referrerPolicy="no-referrer"
        />
    );
}

export default function StoreClientPage({ params }: { params: { companyId: string } }) {
    const { companyId } = params;
    const { items: cartItems, addItem } = useCart();
    const [items, setItems] = useState<Item[]>([]);
    const [companyName, setCompanyName] = useState<string>("Store");
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        async function fetchAll() {
            try {
                // Fetch info and items simultaneously
                const [infoRes, itemsRes] = await Promise.all([
                    fetch(`/api/website/companies/${companyId}/info`),
                    fetch(`/api/website/companies/${companyId}/items${search ? `?search=${encodeURIComponent(search)}` : ''}`)
                ]);

                if (!itemsRes.ok) {
                    throw new Error("Failed to load products");
                }

                if (infoRes.ok) {
                    const infoData = await infoRes.json();
                    if (infoData.company_name) setCompanyName(infoData.company_name);
                }

                const itemsData = await itemsRes.json();
                setItems(itemsData);
            } catch (err: any) {
                setErrorMsg(err.message || "Failed to load store data");
            } finally {
                setIsLoading(false);
            }
        }

        // Debounce search
        const timeout = setTimeout(fetchAll, 300);
        return () => clearTimeout(timeout);
    }, [companyId, search]);

    const totalCartItems = cartItems.reduce((sum, i) => sum + i.quantity, 0);

    return (
        <div className="min-h-screen bg-slate-50 font-sans">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-white border-b border-slate-200/60 shadow-sm backdrop-blur-md bg-white/80">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <h1 className="text-xl font-bold text-slate-900 tracking-tight">{companyName}</h1>
                    <div className="flex items-center gap-4">
                        <Link href={`/store/${companyId}/checkout`} className="relative p-2 bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-100 transition-colors">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            {totalCartItems > 0 && (
                                <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
                                    {totalCartItems}
                                </span>
                            )}
                        </Link>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Search Bar */}
                <div className="max-w-md mx-auto mb-10">
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            placeholder="Search products..."
                            className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-2xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-colors shadow-sm text-sm"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex justify-center items-center h-40">
                        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    </div>
                ) : errorMsg ? (
                    <div className="text-center text-rose-500 p-8 bg-rose-50 rounded-2xl max-w-lg mx-auto">
                        <p>{errorMsg}</p>
                    </div>
                ) : items.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-10 h-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-800">No products found</h3>
                        <p className="text-slate-500 text-sm mt-1">Try searching for something else.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {items.map((item) => {
                            const priceToDisplay = item.default_sales_rate || item.mrp || 0;
                            const taxRate = item.default_tax_rate || 0;
                            const deliveryCharge = item.delivery_charge;

                            return (
                                <div key={item.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl transition-shadow duration-300 overflow-hidden flex flex-col group">
                                    <Link href={`/store/${companyId}/product/${item.id}`} className="block relative aspect-square overflow-hidden bg-slate-50">
                                        <ProductImageFallback url={item.image_url || ""} name={item.name} />
                                    </Link>

                                    <div className="p-5 flex flex-col flex-1">
                                        <Link href={`/store/${companyId}/product/${item.id}`}>
                                            <h3 className="text-lg font-bold text-slate-800 mb-1 line-clamp-1 group-hover:text-indigo-600 transition-colors">{item.name}</h3>
                                        </Link>
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="text-lg font-black text-indigo-600">NPR {priceToDisplay.toLocaleString()}</span>
                                            {item.mrp && item.mrp > priceToDisplay && (
                                                <span className="text-xs text-slate-400 line-through">NPR {item.mrp.toLocaleString()}</span>
                                            )}
                                        </div>

                                        <div className="mt-auto pt-4">
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    addItem({
                                                        id: item.id,
                                                        name: item.name,
                                                        image_url: item.image_url,
                                                        price: priceToDisplay,
                                                        tax_rate: taxRate,
                                                        delivery_charge: deliveryCharge,
                                                        quantity: 1
                                                    });
                                                }}
                                                className="w-full bg-slate-100 hover:bg-indigo-600 text-slate-700 hover:text-white font-semibold py-2.5 px-4 rounded-xl transition-all duration-200 flex flex-row items-center justify-center gap-2"
                                            >
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                                </svg>
                                                Add to Cart
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
