"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCart } from "../../CartProvider";

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

type CompanyInfo = {
    company_name: string;
};

function ProductImage({ url, name }: { url: string; name: string }) {
    const [errored, setErrored] = useState(false);

    if (errored || !url) {
        return (
            <div className="w-full h-full bg-indigo-50/50 rounded-2xl flex flex-col items-center justify-center text-indigo-200 gap-3">
                <svg className="w-24 h-24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
            </div>
        );
    }

    return (
        <img
            src={url}
            alt={name}
            className="max-w-full max-h-full object-contain drop-shadow-2xl rounded-xl transition-transform duration-500 group-hover:scale-105"
            onError={() => setErrored(true)}
            referrerPolicy="no-referrer"
        />
    );
}

export default function StoreProductClient({ companyId, itemId }: { companyId: string; itemId: string }) {
    const [item, setItem] = useState<Item | null>(null);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [quantity, setQuantity] = useState(1);

    const { addItem, items: cartItems } = useCart();
    const [addedToast, setAddedToast] = useState(false);

    useEffect(() => {
        async function fetchAll() {
            try {
                const [itemRes, infoRes] = await Promise.all([
                    fetch(`/api/website/companies/${companyId}/items/${itemId}`),
                    fetch(`/api/website/companies/${companyId}/info`),
                ]);
                if (!itemRes.ok) {
                    const text = await itemRes.text();
                    throw new Error(text || "Error fetching product");
                }
                const [itemData, infoData] = await Promise.all([
                    itemRes.json(),
                    infoRes.ok ? infoRes.json() : null,
                ]);
                setItem(itemData);
                if (infoData) setCompanyInfo(infoData);
            } catch (err: any) {
                setErrorMsg(err.message || "Failed to load product");
            } finally {
                setIsLoading(false);
            }
        }
        fetchAll();
    }, [companyId, itemId]);

    const handleAddToCart = () => {
        if (!item) return;
        const priceToDisplay = item.default_sales_rate || item.mrp || 0;

        addItem({
            id: item.id,
            name: item.name,
            image_url: item.image_url,
            price: priceToDisplay,
            tax_rate: item.default_tax_rate || 0,
            delivery_charge: item.delivery_charge,
            quantity
        });

        setAddedToast(true);
        setTimeout(() => setAddedToast(false), 2000);
        setQuantity(1);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            </div>
        );
    }

    if (errorMsg || !item) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="bg-white px-6 py-8 rounded-2xl shadow-xl border border-rose-100 text-center max-w-sm w-full">
                    <h2 className="text-xl font-bold text-slate-800 mb-2">Unavailable</h2>
                    <p className="text-sm text-slate-500">{errorMsg || "Product not found or not published"}</p>
                    <Link href={`/store/${companyId}`} className="mt-4 inline-block text-indigo-600 underline">
                        Back to Store
                    </Link>
                </div>
            </div>
        );
    }

    const priceToDisplay = item.default_sales_rate || item.mrp || 0;
    const totalCartItems = cartItems.reduce((sum, i) => sum + i.quantity, 0);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 font-sans">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-white/80 border-b border-slate-200/60 shadow-sm backdrop-blur-md">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <Link href={`/store/${companyId}`} className="text-xl font-bold text-slate-900 flex items-center gap-2 hover:text-indigo-600 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        {companyInfo?.company_name || "Store"}
                    </Link>
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

            <div className="py-12 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
                <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col md:flex-row">

                    {/* Left Column: Product Image */}
                    <div className="md:w-1/2 relative bg-slate-50 flex items-center justify-center p-8 group overflow-hidden">
                        <div className="absolute top-0 right-0 -mr-8 -mt-8 w-64 h-64 rounded-full bg-gradient-to-br from-indigo-50 to-purple-50 opacity-50 blur-2xl transform group-hover:scale-110 transition-transform duration-700"></div>
                        <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-48 h-48 rounded-full bg-gradient-to-tr from-sky-50 to-indigo-50 opacity-50 blur-2xl"></div>

                        <div className="relative z-10 w-full aspect-square flex items-center justify-center">
                            {item.image_url ? (
                                <ProductImage url={item.image_url} name={item.name} />
                            ) : (
                                <div className="w-full h-full bg-indigo-50/50 rounded-2xl flex items-center justify-center text-indigo-200">
                                    <svg className="w-32 h-32" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column: Add to Cart details */}
                    <div className="md:w-1/2 p-8 lg:p-12 relative flex flex-col justify-center bg-white z-10">
                        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight leading-tight mb-2">{item.name}</h1>

                        <div className="flex items-baseline gap-2 mb-6">
                            <span className="text-4xl font-black text-indigo-600">NPR {priceToDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            {item.mrp && item.mrp > priceToDisplay && (
                                <span className="text-lg text-slate-400 line-through">NPR {item.mrp.toLocaleString()}</span>
                            )}
                        </div>

                        <p className="text-slate-500 leading-relaxed mb-8 text-base">
                            {item.description || "In stock and ready to ship. Order now to get it fast."}
                        </p>

                        <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Quantity</label>
                                <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                                    <button
                                        type="button"
                                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                        className="w-10 h-10 flex items-center justify-center text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                                    </button>
                                    <div className="w-12 h-10 flex items-center justify-center font-bold text-slate-800 bg-white border-x border-slate-200">
                                        {quantity}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setQuantity(quantity + 1)}
                                        className="w-10 h-10 flex items-center justify-center text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={handleAddToCart}
                                    className="flex-1 bg-white hover:bg-slate-50 border-2 border-indigo-600 text-indigo-600 font-bold py-4 px-6 rounded-2xl transition-all duration-200 shadow-sm flex justify-center items-center gap-2"
                                >
                                    {addedToast ? (
                                        <>
                                            <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                            <span className="text-emerald-600">Added!</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                            Add to Cart
                                        </>
                                    )}
                                </button>
                                <Link
                                    href={`/store/${companyId}/checkout`}
                                    onClick={(e) => {
                                        if (quantity > 0) {
                                            // Optional: automatically add before checkout
                                            handleAddToCart();
                                        }
                                    }}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 px-6 rounded-2xl transition-all duration-200 shadow-xl shadow-indigo-200 flex justify-center items-center text-center"
                                >
                                    Buy Now
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
