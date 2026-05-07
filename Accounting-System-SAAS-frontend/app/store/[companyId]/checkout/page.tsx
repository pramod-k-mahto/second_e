"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "../CartProvider";
import { submitWebsiteOrder, isRetryableWebsiteOrderError } from "@/lib/websiteOrders";
import type { WebsiteOrderCreate, WebsiteOrderResult } from "@/types/websiteOrder";

type CompanyInfo = {
    company_id: number;
    company_name: string;
    payment_qr_url: string | null;
};

type CheckoutState =
    | { status: "idle" }
    | { status: "processing"; idempotencyKey: string | null }
    | { status: "success"; idempotencyKey: string | null; result: WebsiteOrderResult }
    | { status: "error"; error: string; idempotencyKey: string | null };

type PaymentMethod = "cod" | "pay_now";
type QrStep = "idle" | "showing_qr" | "paid_details";

/** Renders QR image with a graceful fallback if the URL fails to load */
function QrImage({ url }: { url: string }) {
    const [errored, setErrored] = useState(false);

    if (errored) {
        return (
            <div className="text-center p-4">
                <div className="w-16 h-16 mx-auto mb-3 bg-slate-200 rounded-xl flex items-center justify-center text-slate-400">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                </div>
                <p className="text-xs font-semibold text-slate-600 mb-1">QR image could not load</p>
            </div>
        );
    }

    return (
        <img
            src={url}
            alt="Payment QR Code"
            className="mx-auto w-56 h-56 object-contain"
            onError={() => setErrored(true)}
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
        />
    );
}

export default function CheckoutPage({ params }: { params: { companyId: string } }) {
    const { companyId } = params;
    const { items, addItem, updateQuantity, removeItem, clearCart, cartTotal, deliveryTotal } = useCart();
    const router = useRouter();

    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Product Search State
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Form State
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [address, setAddress] = useState("");

    // Payment method
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
    const [qrStep, setQrStep] = useState<QrStep>("idle");
    const [transactionId, setTransactionId] = useState("");
    const [paymentScreenshot, setPaymentScreenshot] = useState<string | null>(null);
    const [paymentScreenshotName, setPaymentScreenshotName] = useState("");
    const screenshotInputRef = useRef<HTMLInputElement>(null);

    const [checkoutState, setCheckoutState] = useState<CheckoutState>({ status: "idle" });

    useEffect(() => {
        async function fetchInfo() {
            try {
                const res = await fetch(`/api/website/companies/${companyId}/info`);
                if (res.ok) {
                    const data = await res.json();
                    setCompanyInfo(data);
                }
            } catch (err) {
                console.error("Failed to load company info", err);
            } finally {
                setIsLoading(false);
            }
        }
        fetchInfo();
    }, [companyId]);

    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            return;
        }

        const timeout = setTimeout(async () => {
            setIsSearching(true);
            try {
                const res = await fetch(`/api/website/companies/${companyId}/items?search=${encodeURIComponent(searchQuery)}`);
                if (res.ok) {
                    const data = await res.json();
                    setSearchResults(data);
                }
            } catch (err) {
                console.error("Failed to search products", err);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(timeout);
    }, [searchQuery, companyId]);

    const handleContinueShopping = () => {
        router.push(`/store/${companyId}`);
    };

    const totalAmount = cartTotal + deliveryTotal;
    const hasQr = !!companyInfo?.payment_qr_url;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (items.length === 0) {
            alert("Your cart is empty.");
            return;
        }

        if (!name.trim() || !phone.trim() || !address.trim()) {
            alert("Please fill in all required customer details.");
            return;
        }

        if (!paymentMethod) {
            alert("Please select a Payment Method.");
            return;
        }

        if (paymentMethod === "pay_now" && qrStep !== "paid_details") {
            alert("Please complete the payment step first.");
            return;
        }

        if (paymentMethod === "pay_now") {
            if (!transactionId.trim()) {
                alert("Please enter your Transaction/Reference ID.");
                return;
            }
            if (!paymentScreenshot) {
                alert("Please upload a Payment Screenshot before submitting.");
                return;
            }
        }

        const refSuffix = paymentMethod === "pay_now" ? ` | TXN: ${transactionId.trim()}` : "";

        const orderLines = items.map(item => ({
            item_id: item.id,
            quantity: item.quantity,
            rate: item.price,
            tax_rate: item.tax_rate || 0,
            discount: 0,
        }));

        const payload: WebsiteOrderCreate = {
            reference: `WEB-${Date.now()}${refSuffix}`,
            transaction_id: paymentMethod === "pay_now" && transactionId.trim() ? transactionId.trim() : undefined,
            payment_screenshot: paymentMethod === "pay_now" && paymentScreenshot ? paymentScreenshot : undefined,
            customer: {
                name: name.trim(),
                email: email.trim() || undefined,
                phone: phone.trim(),
                address: address.trim(),
                shipping_address: address.trim(),
                shipping_phone: phone.trim(),
                shipping_address_same_as_billing: true,
            },
            lines: orderLines,
            options: {
                auto_invoice: false,
                notify_customer: true,
                notify_internal: true,
            },
        };

        const existingKey = checkoutState.status === "processing" || checkoutState.status === "error"
            ? checkoutState.idempotencyKey
            : null;

        setCheckoutState({ status: "processing", idempotencyKey: existingKey });

        try {
            const response = await submitWebsiteOrder(companyId, payload, { idempotencyKey: existingKey || undefined });
            setCheckoutState({ status: "success", idempotencyKey: response.idempotencyKey, result: response.data });
            clearCart();
        } catch (err: any) {
            const currentKey = existingKey || err?.idempotencyKey || null;
            if (isRetryableWebsiteOrderError(err) && currentKey) {
                try {
                    const second = await submitWebsiteOrder(companyId, payload, { idempotencyKey: currentKey });
                    setCheckoutState({ status: "success", idempotencyKey: second.idempotencyKey, result: second.data });
                    clearCart();
                    return;
                } catch { }
            }
            setCheckoutState({ status: "error", error: err.message || "Failed to process order", idempotencyKey: currentKey });
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            </div>
        );
    }

    if (checkoutState.status === "success") {
        const { result } = checkoutState;
        
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 py-12">
                <div className="bg-white px-6 sm:px-10 py-10 rounded-3xl shadow-xl w-full max-w-2xl text-center border border-slate-100">
                    <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-3xl font-black text-slate-900 mb-2">Order Confirmed!</h2>
                    <p className="text-slate-600 mb-8">Thank you for your purchase. Your order ID is <strong className="font-mono bg-slate-100 px-2 py-1 rounded text-slate-800">#{result.order_id}</strong>.</p>

                    <div className="flex flex-col sm:flex-row gap-4">
                        <button onClick={handleContinueShopping} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-6 rounded-2xl shadow-xl shadow-indigo-100 transition-all duration-200">
                            Continue Shopping
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-slate-50 to-purple-50 py-10 font-sans selection:bg-indigo-100 selection:text-indigo-900 relative">
            {/* Background Decorations */}
            <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-indigo-100/50 to-transparent pointer-events-none -z-10"></div>
            <div className="absolute top-20 right-20 w-96 h-96 bg-purple-200/40 rounded-full blur-3xl pointer-events-none -z-10"></div>

            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-10">
                    <div className="flex items-center gap-5">
                        <button type="button" onClick={() => router.back()} className="w-12 h-12 bg-white border border-slate-200/60 rounded-full flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 hover:shadow-md transition-all duration-300 shadow-sm">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        </button>
                        <div>
                            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">Checkout</h1>
                            <p className="text-sm font-medium text-slate-500 mt-1 flex items-center gap-1.5">
                                <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                Secure encryption
                            </p>
                        </div>
                    </div>
                </div>

                {items.length === 0 ? (
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-12 text-center">
                        <div className="w-24 h-24 bg-indigo-50 text-indigo-300 rounded-full flex items-center justify-center mx-auto mb-6">
                            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800 mb-2">Your cart is empty</h2>
                        <p className="text-slate-500 mb-8">Looks like you haven&apos;t added any products to your cart yet.</p>
                        <button onClick={handleContinueShopping} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-xl transition-all duration-200 shadow-lg shadow-indigo-200">
                            Start Shopping
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col lg:flex-row gap-8">
                        {/* Left Side: Order Details Form */}
                        <div className="lg:w-7/12 order-2 lg:order-1 space-y-8">

                            <form id="checkout-form" onSubmit={handleSubmit} className="bg-white/80 backdrop-blur-xl p-6 sm:p-10 rounded-3xl shadow-xl shadow-slate-200/50 border border-white space-y-8 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>

                                <div className="space-y-6">
                                    <h3 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                                        <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold">1</span>
                                        Customer Details
                                    </h3>

                                    <div className="space-y-5 bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                                        <div>
                                            <label className="block text-xs font-bold tracking-wide text-slate-600 uppercase mb-1.5">Full Name <span className="text-rose-500">*</span></label>
                                            <input type="text" required placeholder="e.g. John Doe" className="w-full px-4 py-3.5 rounded-xl border border-slate-200/80 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all duration-300 shadow-sm" value={name} onChange={(e) => setName(e.target.value)} />
                                        </div>

                                        <div className="flex flex-col sm:flex-row gap-5">
                                            <div className="flex-1">
                                                <label className="block text-xs font-bold tracking-wide text-slate-600 uppercase mb-1.5">Mobile Number <span className="text-rose-500">*</span></label>
                                                <input type="tel" required placeholder="10 digit number" className="w-full px-4 py-3.5 rounded-xl border border-slate-200/80 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all duration-300 shadow-sm" value={phone} onChange={(e) => setPhone(e.target.value)} />
                                            </div>
                                            <div className="flex-1">
                                                <label className="block text-xs font-bold tracking-wide text-slate-600 uppercase mb-1.5">Email Address <span className="text-[10px] bg-slate-200 text-slate-500 normal-case px-1.5 py-0.5 rounded ml-1 font-bold">Optional</span></label>
                                                <input type="email" placeholder="john@example.com" className="w-full px-4 py-3.5 rounded-xl border border-slate-200/80 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all duration-300 shadow-sm" value={email} onChange={(e) => setEmail(e.target.value)} />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold tracking-wide text-slate-600 uppercase mb-1.5">Delivery Address <span className="text-rose-500">*</span></label>
                                            <textarea required rows={2} placeholder="Full delivery address, landmarks, etc." className="w-full px-4 py-3.5 rounded-xl border border-slate-200/80 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all duration-300 shadow-sm resize-none" value={address} onChange={(e) => setAddress(e.target.value)} />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6 pt-4 border-t border-slate-100">
                                    <h3 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                                        <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold">2</span>
                                        Payment Method
                                    </h3>

                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => { setPaymentMethod("cod"); setQrStep("idle"); }}
                                            className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all duration-200 ${paymentMethod === "cod" ? "border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm" : "border-slate-100 bg-white text-slate-500 hover:border-slate-200 hover:bg-slate-50"}`}
                                        >
                                            <span className="text-2xl mb-1">💵</span>
                                            <span className="font-bold text-sm">Cash on Delivery</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPaymentMethod("pay_now")}
                                            className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all duration-200 ${paymentMethod === "pay_now" ? "border-emerald-600 bg-emerald-50 text-emerald-800 shadow-sm" : "border-slate-100 bg-white text-slate-500 hover:border-slate-200 hover:bg-slate-50"}`}
                                        >
                                            <span className="text-2xl mb-1">📱</span>
                                            <span className="font-bold text-sm">Pay Now</span>
                                        </button>
                                    </div>

                                    {/* ── Pay Now flow ── */}
                                    {paymentMethod === "pay_now" && (
                                        <div className="bg-emerald-50 border-2 border-emerald-100 rounded-2xl p-5 space-y-4">

                                            {qrStep === "idle" && (
                                                <div className="text-center">
                                                    <p className="text-emerald-800 font-medium text-sm mb-4">Complete your payment of <strong className="font-black">NPR {totalAmount.toLocaleString()}</strong> by scanning the QR code.</p>
                                                    {hasQr ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setQrStep("showing_qr")}
                                                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-md"
                                                        >
                                                            Show QR Code
                                                        </button>
                                                    ) : (
                                                        <p className="text-xs text-rose-600 bg-rose-50 py-2 px-3 rounded-lg inline-block border border-rose-100">
                                                            Payment QR not configured by the store.
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            {qrStep === "showing_qr" && hasQr && (
                                                <div className="text-center bg-white rounded-2xl p-6 border border-emerald-200 shadow-sm relative">
                                                    <button type="button" onClick={() => setQrStep("idle")} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600">
                                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                    <h4 className="font-black text-slate-800 mb-1">Scan & Pay</h4>
                                                    <p className="text-xs text-emerald-600 font-medium mb-4">NPR {totalAmount.toLocaleString()}</p>

                                                    <div className="mb-6 flex justify-center">
                                                        <QrImage url={companyInfo!.payment_qr_url!} />
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => setQrStep("paid_details")}
                                                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-xl shadow-lg transition-all"
                                                    >
                                                        ✅ I have Paid
                                                    </button>
                                                </div>
                                            )}

                                            {qrStep === "paid_details" && (
                                                <div className="space-y-4 bg-white p-5 rounded-2xl border border-emerald-200">
                                                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                                        <span className="font-bold text-emerald-800 flex items-center gap-2">
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                            Payment Initiated
                                                        </span>
                                                        <button type="button" onClick={() => setQrStep("showing_qr")} className="text-xs text-emerald-600 underline font-medium">View QR again</button>
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Transaction ID <span className="text-rose-500">*</span></label>
                                                        <input
                                                            type="text"
                                                            required={paymentMethod === "pay_now"}
                                                            placeholder="e.g. ABC123456"
                                                            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                                                            value={transactionId}
                                                            onChange={(e) => setTransactionId(e.target.value)}
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Payment Screenshot <span className="text-rose-500">*</span></label>
                                                        <input
                                                            ref={screenshotInputRef}
                                                            type="file"
                                                            accept="image/*"
                                                            className="hidden"
                                                            onChange={(e) => {
                                                                const file = e.target.files?.[0];
                                                                if (!file) return;
                                                                setPaymentScreenshotName(file.name);
                                                                const reader = new FileReader();
                                                                reader.onload = () => {
                                                                    if (typeof reader.result === "string") setPaymentScreenshot(reader.result);
                                                                };
                                                                reader.readAsDataURL(file);
                                                            }}
                                                        />

                                                        {paymentScreenshot ? (
                                                            <div className="relative border border-slate-200 rounded-xl overflow-hidden bg-slate-50 mt-1">
                                                                <img src={paymentScreenshot} alt="Payment proof" className="w-full max-h-40 object-contain" />
                                                                <button type="button" onClick={() => { setPaymentScreenshot(null); setPaymentScreenshotName(""); if (screenshotInputRef.current) screenshotInputRef.current.value = ""; }} className="absolute top-2 right-2 bg-rose-500 text-white w-7 h-7 flex items-center justify-center rounded-full shadow-md">
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button type="button" onClick={() => screenshotInputRef.current?.click()} className="w-full mt-1 border-2 border-dashed border-slate-200 text-slate-500 font-medium rounded-xl py-3 hover:bg-slate-50 hover:border-slate-300 transition-colors flex items-center justify-center gap-2 text-sm">
                                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                                                Upload Screenshot
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {checkoutState.status === "error" && (
                                        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl font-medium">
                                            {checkoutState.error}
                                        </div>
                                    )}
                                </div>
                            </form>
                        </div>

                        {/* Right Side: Order Summary */}
                        <div className="lg:w-5/12 order-1 lg:order-2">
                            <div className="bg-gradient-to-b from-white to-slate-50 p-6 sm:p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200/60 sticky top-24">
                                <h3 className="text-2xl font-black text-slate-900 mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
                                    Order Summary
                                    <span className="bg-indigo-100 text-indigo-700 text-xs font-bold py-1 px-3 rounded-full flex items-center gap-1.5">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                                        {items.length} items
                                    </span>
                                </h3>

                                <div className="mb-6 relative">
                                    <div className="relative">
                                        <input
                                            type="text"
                                            placeholder="Search and add more products..."
                                            className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500 text-sm transition-all shadow-sm"
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                        />
                                        <svg className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                    </div>

                                    {searchQuery.trim() && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-slate-100 max-h-[18rem] overflow-y-auto z-50">
                                            {isSearching ? (
                                                <div className="p-6 text-center text-sm text-slate-500 font-medium">Searching...</div>
                                            ) : searchResults.length === 0 ? (
                                                <div className="p-6 text-center text-sm text-slate-500 font-medium">No products found.</div>
                                            ) : (
                                                <div className="py-2">
                                                    {searchResults.map(item => {
                                                        const priceDisplay = item.default_sales_rate || item.mrp || 0;
                                                        return (
                                                            <button
                                                                key={item.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    addItem({
                                                                        id: item.id,
                                                                        name: item.name,
                                                                        image_url: item.image_url,
                                                                        price: priceDisplay,
                                                                        tax_rate: item.default_tax_rate || 0,
                                                                        delivery_charge: item.delivery_charge,
                                                                        quantity: 1
                                                                    });
                                                                    setSearchQuery("");
                                                                }}
                                                                className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-3 transition-colors border-b border-slate-50 last:border-0 group"
                                                            >
                                                                <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0 border border-slate-200">
                                                                    {item.image_url ? (
                                                                        <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="font-bold text-slate-800 text-sm truncate group-hover:text-indigo-600 transition-colors">{item.name}</div>
                                                                    <div className="text-indigo-600 font-semibold text-xs mt-0.5">NPR {priceDisplay.toLocaleString()}</div>
                                                                </div>
                                                                <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2 mb-6">
                                    {items.map(item => (
                                        <div key={item.id} className="flex items-start gap-4 pb-4 border-b border-slate-50 last:border-0 last:pb-0">
                                            <div className="w-16 h-16 bg-slate-100 rounded-xl overflow-hidden flex-shrink-0 border border-slate-200 flex items-center justify-center">
                                                {item.image_url ? (
                                                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                    </svg>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold text-slate-800 text-sm line-clamp-2">{item.name}</h4>
                                                <div className="text-indigo-600 font-bold text-sm mt-1">NPR {item.price.toLocaleString()}</div>

                                                <div className="flex items-center gap-3 mt-2">
                                                    <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden shadow-sm">
                                                        <button type="button" onClick={() => updateQuantity(item.id, item.quantity - 1)} className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-100"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" /></svg></button>
                                                        <span className="w-8 text-center text-xs font-bold text-slate-800">{item.quantity}</span>
                                                        <button type="button" onClick={() => updateQuantity(item.id, item.quantity + 1)} className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-100"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg></button>
                                                    </div>
                                                    <button type="button" onClick={() => removeItem(item.id)} className="text-[10px] text-rose-500 uppercase tracking-widest font-bold hover:underline">Remove</button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="space-y-3 pt-5 border-t border-slate-100 mb-6">
                                    <div className="flex justify-between items-center text-slate-500 text-sm font-medium">
                                        <span>Subtotal</span>
                                        <span className="text-slate-800 font-bold">NPR {cartTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-slate-500 text-sm font-medium">
                                        <span>Shipping</span>
                                        {deliveryTotal > 0 ? (
                                            <span className="text-slate-800 font-bold">NPR {deliveryTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        ) : (
                                            <span className="text-emerald-600 font-bold bg-emerald-50 px-2 rounded">Free</span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex justify-between items-end pt-5 border-t border-slate-200">
                                    <span className="text-sm font-bold text-slate-800 uppercase tracking-wider">Total</span>
                                    <span className="text-3xl font-black text-indigo-700 leading-none">NPR {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>

                                <div className="mt-8">
                                    <button
                                        type="submit"
                                        form="checkout-form"
                                        disabled={!paymentMethod || checkoutState.status === "processing" || (paymentMethod === "pay_now" && (!transactionId.trim() || !paymentScreenshot || qrStep !== "paid_details"))}
                                        className={`w-full font-black py-4 px-6 rounded-2xl shadow-xl transition-all duration-300 uppercase tracking-wider flex justify-center items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${!paymentMethod
                                            ? "bg-slate-300 text-slate-500 shadow-none"
                                            : paymentMethod === "pay_now"
                                                ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200"
                                                : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200"
                                            }`}
                                    >
                                        {checkoutState.status === "processing" ? (
                                            <>
                                                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Processing...
                                            </>
                                        ) : (
                                            <>
                                                {paymentMethod === "pay_now" ? "Place Order (Paid)" : paymentMethod === "cod" ? "Place Order (Cash On Delivery)" : "Select Payment Method"}
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
