"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";

import { api } from "@/lib/api";
import { usePermissions } from "@/components/PermissionsContext";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type PromoChannel = "Email" | "SMS" | "WhatsApp" | "Facebook" | "Instagram";
type ApiProvider = "Shopify" | "WooCommerce" | "Custom";
type SeoPreset = "Basic" | "Advanced";
type OrdersMode = "Disabled" | "Receive Orders" | "Receive + Auto-Create Sales Order";

type CompanySettings = {
    company_id: number;
    notify_on_dispatch: boolean;
    notify_on_delivery: boolean;
    notify_on_order_placed: boolean;
    notify_on_payment_received: boolean;
    notify_on_overdue: boolean;
    overdue_reminders: number[] | null;
    message_templates: {
        dispatch?: string;
        delivery?: string;
        order_placed?: string;
        payment_received?: string;
        overdue?: string;
        statement?: string;
    } | null;

    smtp_config: {
        host?: string;
        port?: number;
        user?: string;
        password?: string;
        from_email?: string;
    } | null;
    whatsapp_config: {
        api_endpoint?: string;
        token?: string;
        from_number?: string;
    } | null;
};

export default function NotificationSettingsPage() {
    const params = useParams();
    const companyId = params?.companyId as string;

    const permissions = usePermissions();
    const canUpdate = permissions.can("settings_company", "update");

    const { data: settings, error, isLoading, mutate } = useSWR<CompanySettings>(
        companyId ? `/companies/${companyId}/settings` : null,
        fetcher
    );

    const [activeStep, setActiveStep] = useState(1);
    const steps = [
        { id: 1, title: "Automations" },
        { id: 2, title: "Templates" },
        { id: 3, title: "Marketing" },
        { id: 4, title: "Integrations" },
    ];

    const [notifyDispatch, setNotifyDispatch] = useState(false);
    const [notifyDelivery, setNotifyDelivery] = useState(false);
    const [notifyOrderPlaced, setNotifyOrderPlaced] = useState(false);
    const [notifyPaymentReceived, setNotifyPaymentReceived] = useState(false);
    const [notifyOverdue, setNotifyOverdue] = useState(false);
    const [reminders, setReminders] = useState("1, 7, 30");

    const [templates, setTemplates] = useState({
        dispatch: "",
        delivery: "",
        order_placed: "",
        payment_received: "",
        overdue: "",
        statement: ""
    });

    // SMTP state
    const [smtpHost, setSmtpHost] = useState("");
    const [smtpPort, setSmtpPort] = useState(587);
    const [smtpUser, setSmtpUser] = useState("");
    const [smtpPass, setSmtpPass] = useState("");
    const [smtpFrom, setSmtpFrom] = useState("");

    // WhatsApp state
    const [waEndpoint, setWaEndpoint] = useState("");
    const [waToken, setWaToken] = useState("");
    const [waFrom, setWaFrom] = useState("");

    // Promo state scaffold
    const [promoChannel, setPromoChannel] = useState<PromoChannel>("WhatsApp");
    const [autoPromoteNewProducts, setAutoPromoteNewProducts] = useState(true);
    const [discountPercent, setDiscountPercent] = useState(5);

    const [apiProvider, setApiProvider] = useState<ApiProvider>("Custom");
    const [apiBaseUrl, setApiBaseUrl] = useState("");
    const [apiKey, setApiKey] = useState("");

    const [facebookPage, setFacebookPage] = useState("");
    const [instagramHandle, setInstagramHandle] = useState("");
    const [whatsAppNumber, setWhatsAppNumber] = useState("");

    const [seoPreset, setSeoPreset] = useState<SeoPreset>("Basic");
    const [siteTitle, setSiteTitle] = useState("");
    const [metaDescription, setMetaDescription] = useState("");

    const [ordersMode, setOrdersMode] = useState<OrdersMode>("Receive Orders");
    const [notifyEmail, setNotifyEmail] = useState("");

    const [saving, setSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        if (!settings) return;
        setNotifyDispatch(settings.notify_on_dispatch || false);
        setNotifyDelivery(settings.notify_on_delivery || false);
        setNotifyOrderPlaced(settings.notify_on_order_placed || false);
        setNotifyPaymentReceived(settings.notify_on_payment_received || false);
        setNotifyOverdue(settings.notify_on_overdue || false);
        setReminders((settings.overdue_reminders || [1, 7, 30]).join(", "));

        setTemplates({
            dispatch: settings.message_templates?.dispatch || "",
            delivery: settings.message_templates?.delivery || "",
            order_placed: settings.message_templates?.order_placed || "",
            payment_received: settings.message_templates?.payment_received || "",
            overdue: settings.message_templates?.overdue || "",
            statement: settings.message_templates?.statement || ""
        });

        if (settings.smtp_config) {
            setSmtpHost(settings.smtp_config.host || "");
            setSmtpPort(settings.smtp_config.port || 587);
            setSmtpUser(settings.smtp_config.user || "");
            setSmtpPass(settings.smtp_config.password || "");
            setSmtpFrom(settings.smtp_config.from_email || "");
        }

        if (settings.whatsapp_config) {
            setWaEndpoint(settings.whatsapp_config.api_endpoint || "");
            setWaToken(settings.whatsapp_config.token || "");
            setWaFrom(settings.whatsapp_config.from_number || "");
        }
    }, [settings]);

    const readiness = useMemo(() => {
        const promoOk = promoChannel !== "WhatsApp" || Boolean(whatsAppNumber.trim());
        const apiOk = apiProvider !== "Custom" || (Boolean(apiBaseUrl.trim()) && Boolean(apiKey.trim()));
        const socialOk = Boolean(facebookPage.trim()) || Boolean(instagramHandle.trim()) || Boolean(whatsAppNumber.trim());
        const seoOk = seoPreset !== "Advanced" || (Boolean(siteTitle.trim()) && Boolean(metaDescription.trim()));
        const ordersOk = ordersMode === "Disabled" || Boolean(notifyEmail.trim());

        const okCount = [promoOk, apiOk, socialOk, seoOk, ordersOk].filter(Boolean).length;
        return {
            promoOk,
            apiOk,
            socialOk,
            seoOk,
            ordersOk,
            okCount,
            total: 5,
        };
    }, [apiBaseUrl, apiKey, apiProvider, facebookPage, instagramHandle, metaDescription, notifyEmail, ordersMode, promoChannel, seoPreset, siteTitle, whatsAppNumber]);

    const hasChanges = useMemo(() => {
        if (!settings) return false;
        const togglesChanged =
            notifyDispatch !== (settings.notify_on_dispatch || false) ||
            notifyDelivery !== (settings.notify_on_delivery || false) ||
            notifyOrderPlaced !== (settings.notify_on_order_placed || false) ||
            notifyPaymentReceived !== (settings.notify_on_payment_received || false) ||
            notifyOverdue !== (settings.notify_on_overdue || false);

        const remindersChanged = reminders !== (settings.overdue_reminders || [1, 7, 30]).join(", ");

        const tmpl = settings.message_templates || {};
        const templatesChanged = (Object.keys(templates) as Array<keyof typeof templates>).some(
            (key) => templates[key] !== (tmpl[key] || "")
        );

        const smtp = settings.smtp_config || {};
        const smtpChanged =
            smtpHost !== (smtp.host || "") ||
            smtpPort !== (smtp.port || 587) ||
            smtpUser !== (smtp.user || "") ||
            smtpPass !== (smtp.password || "") ||
            smtpFrom !== (smtp.from_email || "");

        const wa = settings.whatsapp_config || {};
        const waChanged =
            waEndpoint !== (wa.api_endpoint || "") ||
            waToken !== (wa.token || "") ||
            waFrom !== (wa.from_number || "");

        return togglesChanged || remindersChanged || templatesChanged || smtpChanged || waChanged;
    }, [notifyDispatch, notifyDelivery, notifyOrderPlaced, notifyPaymentReceived, notifyOverdue, reminders, templates, smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, waEndpoint, waToken, waFrom, settings]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!companyId || !canUpdate) return;

        setSaving(true);
        setErrorMessage(null);
        setSuccessMessage(null);

        const payload = {
            notify_on_dispatch: notifyDispatch,
            notify_on_delivery: notifyDelivery,
            notify_on_order_placed: notifyOrderPlaced,
            notify_on_payment_received: notifyPaymentReceived,
            notify_on_overdue: notifyOverdue,
            overdue_reminders: reminders.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n)),
            message_templates: templates,
            smtp_config: {
                host: smtpHost,
                port: Number(smtpPort),
                user: smtpUser,
                password: smtpPass,
                from_email: smtpFrom
            },
            whatsapp_config: {
                api_endpoint: waEndpoint,
                token: waToken,
                from_number: waFrom
            }
        };

        try {
            await api.patch(`/companies/${companyId}/settings`, payload);
            await mutate();
            await globalMutate((key) => typeof key === "string" && key === `/companies/${companyId}/settings`);
            setSuccessMessage("Communications & Notifications settings saved.");
            setIsEditing(false);
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            setErrorMessage(typeof detail === "string" ? detail : "Failed to save settings.");
        } finally {
            setSaving(false);
        }
    };

    const TemplateField = ({ label, value, onChange, placeholders }: { label: string, value: string, onChange: (v: string) => void, placeholders: string[] }) => (
        <div className="space-y-1.5 bg-white p-4 rounded-xl border border-slate-100 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]">
            <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">{label}</label>
                <div className="text-[10px] text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full font-medium">{placeholders.length} Placeholders</div>
            </div>
            <textarea
                className="w-full h-24 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none resize-none font-sans transition-all"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={`Type the message for ${label.toLowerCase()}...`}
            />
            <div className="text-[10px] text-slate-400 mt-1">Available variables: {placeholders.join(", ")}</div>
        </div>
    );

    return (
        <div className="space-y-6 text-sm max-w-5xl mx-auto pb-10">
            {/* Header */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
                <div className="h-[3px] w-full bg-gradient-to-r from-rose-500 via-purple-500 to-indigo-500" />
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-6 py-5">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-100 to-indigo-50 dark:from-purple-900/40 dark:to-indigo-900/20 border border-purple-100 dark:border-purple-800/50 shadow-inner">
                            <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">Setup Assistant</h1>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight mt-1 max-w-sm">
                                Configure your communications, automate alerts, and connect integrations step-by-step.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {!isEditing && canUpdate && (
                            <button
                                type="button"
                                onClick={() => setIsEditing(true)}
                                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md transition-all active:scale-95 flex items-center gap-2"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                                Modify Settings
                            </button>
                        )}
                        {isEditing && (
                            <button
                                type="button"
                                onClick={() => {
                                    setIsEditing(false);
                                    if (settings) {
                                        setNotifyDispatch(settings.notify_on_dispatch || false);
                                        setNotifyDelivery(settings.notify_on_delivery || false);
                                        setNotifyOrderPlaced(settings.notify_on_order_placed || false);
                                        setNotifyPaymentReceived(settings.notify_on_payment_received || false);
                                        setNotifyOverdue(settings.notify_on_overdue || false);
                                        setReminders((settings.overdue_reminders || [1, 7, 30]).join(", "));
                                        setTemplates({
                                            dispatch: settings.message_templates?.dispatch || "",
                                            delivery: settings.message_templates?.delivery || "",
                                            order_placed: settings.message_templates?.order_placed || "",
                                            payment_received: settings.message_templates?.payment_received || "",
                                            overdue: settings.message_templates?.overdue || "",
                                            statement: settings.message_templates?.statement || ""
                                        });
                                    }
                                    setErrorMessage(null);
                                    setSuccessMessage(null);
                                }}
                                className="px-5 py-2 rounded-xl border-2 border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold transition-all"
                            >
                                Cancel
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => window.history.back()}
                            className="px-4 py-2 rounded-xl border-2 border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 text-xs font-bold transition-all flex items-center gap-2"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Close
                        </button>
                    </div>
                </div>

                {/* Wizard Stepper */}
                <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between overflow-x-auto custom-scrollbar">
                    {steps.map((step, idx) => (
                        <div key={step.id} className="flex items-center">
                            <button
                                type="button"
                                onClick={() => setActiveStep(step.id)}
                                className={`flex items-center gap-2 group transition-all mr-2 ${activeStep === step.id ? 'opacity-100 scale-105' : 'opacity-60 hover:opacity-100'}`}
                            >
                                <div className={`w-8 h-8 flex items-center justify-center rounded-full text-xs font-bold transition-all shadow-sm ${activeStep === step.id ? 'bg-purple-600 text-white shadow-purple-200' : 'bg-white border border-slate-200 text-slate-500 group-hover:border-purple-300 group-hover:text-purple-600'}`}>
                                    {step.id}
                                </div>
                                <span className={`text-sm font-bold tracking-wide transition-all ${activeStep === step.id ? 'text-slate-800' : 'text-slate-500 group-hover:text-slate-700'}`}>{step.title}</span>
                            </button>
                            {idx < steps.length - 1 && (
                                <div className="flex items-center px-4">
                                    <svg className={`w-4 h-4 ${activeStep > step.id ? 'text-purple-500' : 'text-slate-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 relative">
                <fieldset disabled={!isEditing || saving || isLoading} className="space-y-6">
                {errorMessage && <div className="p-4 rounded-xl bg-red-50 text-red-700 border border-red-200 flex items-center gap-2 font-medium animate-in fade-in"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>{errorMessage}</div>}
                {successMessage && <div className="p-4 rounded-xl bg-green-50 text-green-700 border border-green-200 flex items-center gap-2 font-medium animate-in fade-in"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>{successMessage}</div>}

                {/* STEP 1: Automations */}
                {activeStep === 1 && (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300 grid grid-cols-1 md:grid-cols-2 gap-6">

                        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col hover:border-purple-200 hover:shadow-md transition-all">
                            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-gradient-to-r from-slate-50 to-white">
                                <div className="p-1.5 bg-purple-100 text-purple-600 rounded-lg"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div>
                                <div>
                                    <h2 className="font-bold text-slate-800 text-sm">Automated Alerts</h2>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">Push Notifications</p>
                                </div>
                            </div>
                            <div className="p-5 space-y-5 flex-1">
                                {[
                                    { label: "Dispatch Alert", sub: "Send a message when a package is marked as dispatched.", state: notifyDispatch, set: setNotifyDispatch },
                                    { label: "Delivery Alert", sub: "Confirm with the customer upon successful delivery.", state: notifyDelivery, set: setNotifyDelivery },
                                    { label: "Order Placed", sub: "Acknowledge when a fresh order is registered.", state: notifyOrderPlaced, set: setNotifyOrderPlaced },
                                    { label: "Payment Received", sub: "Send a receipt when a payment is logged.", state: notifyPaymentReceived, set: setNotifyPaymentReceived },
                                    { label: "Overdue Reminders", sub: "Automatically chase up late payments.", state: notifyOverdue, set: setNotifyOverdue },
                                ].map((item, idx) => (
                                    <label key={idx} className="flex items-start justify-between cursor-pointer group pb-4 border-b border-slate-50 last:border-0 last:pb-0">
                                        <div className="pr-4">
                                            <div className="text-sm font-bold text-slate-700 group-hover:text-purple-700 transition-colors">{item.label}</div>
                                            <div className="text-xs text-slate-400 mt-1 leading-snug">{item.sub}</div>
                                        </div>
                                        <div className="relative mt-1 shrink-0">
                                            <input type="checkbox" className="sr-only peer" checked={item.state} onChange={e => item.set(e.target.checked)} />
                                            <div className="w-10 h-5 bg-slate-200 rounded-full peer peer-checked:bg-purple-600 transition-colors shadow-inner" />
                                            <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm peer-checked:left-5 transition-all" />
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-6">
                            {notifyOverdue && (
                                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col hover:border-rose-200 hover:shadow-md transition-all animate-in zoom-in-95">
                                    <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-gradient-to-r from-rose-50 to-white">
                                        <div className="p-1.5 bg-rose-100 text-rose-600 rounded-lg"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                                        <div>
                                            <h2 className="font-bold text-slate-800 text-sm">Overdue Schedule</h2>
                                            <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">Reminder Intervals</p>
                                        </div>
                                    </div>
                                    <div className="p-5 space-y-4">
                                        <label className="space-y-2 block">
                                            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Days after due date</span>
                                            <div className="relative">
                                                <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:ring-2 focus:ring-rose-500 outline-none shadow-sm font-mono bg-slate-50 focus:bg-white transition-all" value={reminders} onChange={e => setReminders(e.target.value)} placeholder="e.g. 1, 7, 30" />
                                                <div className="absolute right-3 top-3 text-slate-300"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                                            </div>
                                        </label>
                                        <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 text-center">
                                            A separate reminder message will be triggered exactly on each of these specified intervals.
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 flex flex-col items-center justify-center text-center">
                                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100 mb-3">
                                    <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </div>
                                <h3 className="text-sm font-bold text-slate-800 mb-1">Automation Engine</h3>
                                <p className="text-xs text-slate-500 max-w-[250px]">
                                    Toggle the events you want to automate. Configure the message content in the next step.
                                </p>
                            </div>
                        </div>

                    </div>
                )}

                {/* STEP 2: Templates */}
                {activeStep === 2 && (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <TemplateField label="Order Placed" value={templates.order_placed} onChange={v => setTemplates({ ...templates, order_placed: v })} placeholders={["{{customer_name}}", "{{invoice_number}}", "{{amount}}"]} />
                            <TemplateField label="Payment Received" value={templates.payment_received} onChange={v => setTemplates({ ...templates, payment_received: v })} placeholders={["{{customer_name}}", "{{invoice_number}}", "{{amount}}"]} />
                            <TemplateField label="Dispatch Update" value={templates.dispatch} onChange={v => setTemplates({ ...templates, dispatch: v })} placeholders={["{{customer_name}}", "{{invoice_number}}", "{{tracking_number}}"]} />
                            <TemplateField label="Delivery Complete" value={templates.delivery} onChange={v => setTemplates({ ...templates, delivery: v })} placeholders={["{{customer_name}}", "{{invoice_number}}"]} />
                            <TemplateField label="Overdue Warning" value={templates.overdue} onChange={v => setTemplates({ ...templates, overdue: v })} placeholders={["{{customer_name}}", "{{invoice_number}}", "{{amount}}", "{{days_overdue}}"]} />
                            <TemplateField label="Account Statement" value={templates.statement} onChange={v => setTemplates({ ...templates, statement: v })} placeholders={["{{customer_name}}", "{{company_name}}"]} />
                        </div>
                    </div>
                )}

                {/* STEP 3: Marketing & SEO */}
                {activeStep === 3 && (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300 grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Promotions Card */}
                        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden hover:border-orange-200 hover:shadow-md transition-all">
                            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-orange-50 to-white">
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 bg-orange-100 text-orange-600 rounded-lg"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg></div>
                                    <div>
                                        <h2 className="font-bold text-slate-800 text-sm">Product Promotions</h2>
                                        <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">Marketing Engine</p>
                                    </div>
                                </div>
                                <div className={`text-[10px] font-extrabold uppercase px-2 py-1 rounded-full ${readiness.promoOk ? "text-emerald-700 bg-emerald-100" : "text-amber-700 bg-amber-100"}`}>
                                    {readiness.promoOk ? "Ready" : "Incomplete"}
                                </div>
                            </div>
                            <div className="p-5 space-y-6">
                                <div className="grid grid-cols-2 gap-5">
                                    <label className="space-y-1.5 block">
                                        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">Target Channel</span>
                                        <select className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-orange-500 outline-none transition-all shadow-sm" value={promoChannel} onChange={(e) => setPromoChannel(e.target.value as PromoChannel)}>
                                            <option value="WhatsApp">WhatsApp Message</option>
                                            <option value="Email">Email Broadcast</option>
                                            <option value="SMS">SMS Text</option>
                                            <option value="Facebook">Facebook Post</option>
                                            <option value="Instagram">Instagram Story/Post</option>
                                        </select>
                                    </label>
                                    <label className="space-y-1.5 block">
                                        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">Default Discount</span>
                                        <div className="relative">
                                            <input type="number" min={0} max={90} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-orange-500 outline-none transition-all shadow-sm pr-8" value={discountPercent} onChange={(e) => setDiscountPercent(Number(e.target.value))} />
                                            <span className="absolute right-4 top-2.5 font-bold text-slate-400">%</span>
                                        </div>
                                    </label>
                                </div>

                                <label className="flex items-center gap-3 p-3 rounded-xl border border-orange-100 bg-orange-50/50 cursor-pointer shadow-sm hover:bg-orange-50 transition-colors">
                                    <input type="checkbox" checked={autoPromoteNewProducts} onChange={(e) => setAutoPromoteNewProducts(e.target.checked)} className="h-5 w-5 rounded border-orange-300 text-orange-600 focus:ring-orange-500" />
                                    <div>
                                        <span className="text-sm text-slate-800 font-bold block">Auto-Promote New Arrivals</span>
                                        <span className="text-[10px] text-slate-500 leading-none">Fire campaigns automatically upon item creation.</span>
                                    </div>
                                </label>

                                {promoChannel === "WhatsApp" && (
                                    <div className="animate-in slide-in-from-top-2 fade-in">
                                        <label className="space-y-1.5 block">
                                            <div className="flex justify-between items-center block">
                                                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">WhatsApp Sender ID</span>
                                                <span className="text-[10px] text-orange-500">* Required</span>
                                            </div>
                                            <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-orange-500 outline-none transition-all shadow-sm" value={whatsAppNumber} onChange={(e) => setWhatsAppNumber(e.target.value)} placeholder="e.g. +977 98XX XXXXXX" />
                                        </label>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-6">
                            {/* Social Profiles */}
                            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden hover:border-blue-200 hover:shadow-md transition-all">
                                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-white">
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg></div>
                                        <h2 className="font-bold text-slate-800 text-sm">Social Profiles</h2>
                                    </div>
                                </div>
                                <div className="p-5 space-y-4">
                                    <label className="space-y-1.5 block">
                                        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Facebook Page</span>
                                        <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" value={facebookPage} onChange={(e) => setFacebookPage(e.target.value)} placeholder="https://facebook.com/yourpage" />
                                    </label>
                                    <label className="space-y-1.5 block">
                                        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Instagram Handle</span>
                                        <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-pink-500 outline-none transition-all" value={instagramHandle} onChange={(e) => setInstagramHandle(e.target.value)} placeholder="@yourbrand" />
                                    </label>
                                </div>
                            </div>

                            {/* SEO Setup */}
                            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden hover:border-indigo-200 hover:shadow-md transition-all">
                                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-white">
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></div>
                                        <h2 className="font-bold text-slate-800 text-sm">SEO Meta Base</h2>
                                    </div>
                                </div>
                                <div className="p-5 space-y-4">
                                    <label className="space-y-1.5 block">
                                        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Global Site Title</span>
                                        <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all" value={siteTitle} onChange={(e) => setSiteTitle(e.target.value)} placeholder="e.g. My Company Online Store" />
                                    </label>
                                    <label className="space-y-1.5 block">
                                        <div className="flex justify-between">
                                            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Meta Description</span>
                                            <span className="text-[10px] text-slate-400">{metaDescription.length}/160</span>
                                        </div>
                                        <textarea className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-20 transition-all font-sans" value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} placeholder="A snappy description for search engines to display." />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 4: Integrations */}
                {activeStep === 4 && (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                            {/* SMTP Config View */}
                            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden hover:border-emerald-300 hover:shadow-md transition-all flex flex-col">
                                <div className="px-5 py-4 flex items-center gap-3 border-b border-slate-100 bg-emerald-50/50">
                                    <div className="p-2 bg-emerald-100 rounded-full text-emerald-600"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg></div>
                                    <h2 className="font-bold text-slate-800">Email Gateway (SMTP)</h2>
                                </div>
                                <div className="p-5 space-y-4 flex-1">
                                    <input className="w-full text-sm rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:border-transparent ring-emerald-500 transition-all" placeholder="Host (smtp.gmail.com)" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} />
                                    <input className="w-full text-sm rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:border-transparent ring-emerald-500 transition-all" placeholder="Login Email" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} />
                                    <input type="password" className="w-full text-sm rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:border-transparent ring-emerald-500 transition-all" placeholder="App Password / Sec Key" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} />
                                </div>
                                {smtpHost ? (
                                    <div className="px-5 py-3 border-t border-emerald-100 bg-emerald-50 text-xs text-emerald-700 font-bold flex items-center justify-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Gateway Configured
                                    </div>
                                ) : (
                                    <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-500 font-bold flex items-center justify-center gap-2">
                                        Gateway Not Setup
                                    </div>
                                )}
                            </div>

                            {/* WhatsApp API Config */}
                            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden hover:border-emerald-300 hover:shadow-md transition-all flex flex-col">
                                <div className="px-5 py-4 flex items-center gap-3 border-b border-slate-100 bg-emerald-50/50">
                                    <div className="p-2 bg-emerald-100 rounded-full text-emerald-600"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg></div>
                                    <h2 className="font-bold text-slate-800">WhatsApp API</h2>
                                </div>
                                <div className="p-5 space-y-4 flex-1">
                                    <input className="w-full text-sm rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:border-transparent ring-emerald-500 transition-all shadow-sm" placeholder="Web Hook Endpoint" value={waEndpoint} onChange={e => setWaEndpoint(e.target.value)} />
                                    <input type="password" className="w-full text-sm rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:border-transparent ring-emerald-500 transition-all shadow-sm" placeholder="Auth Token / Bearer" value={waToken} onChange={e => setWaToken(e.target.value)} />
                                    <input className="w-full text-sm rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:border-transparent ring-emerald-500 transition-all shadow-sm" placeholder="Sender Profile Number" value={waFrom} onChange={e => setWaFrom(e.target.value)} />
                                </div>
                            </div>

                            {/* Store Connect Module */}
                            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden hover:border-emerald-300 hover:shadow-md transition-all flex flex-col">
                                <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100 bg-emerald-50/50">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-emerald-100 rounded-full text-emerald-600"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg></div>
                                        <h2 className="font-bold text-slate-800">Store Engine Sync</h2>
                                    </div>
                                </div>
                                <div className="p-5 space-y-4 flex-1">
                                    <label className="block space-y-1">
                                        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Engine Provider</span>
                                        <select className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:bg-white focus:ring-2 focus:border-transparent ring-emerald-500 shadow-sm transition-all" value={apiProvider} onChange={(e) => setApiProvider(e.target.value as ApiProvider)}>
                                            <option value="Custom">Custom REST API</option>
                                            <option value="Shopify">Shopify Engine</option>
                                            <option value="WooCommerce">WooCommerce Engine</option>
                                        </select>
                                    </label>
                                    <input className="w-full text-sm rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:border-transparent ring-emerald-500 shadow-sm transition-all" value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} placeholder="Store Base URL" />
                                    <input type="password" className="w-full text-sm rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none focus:bg-white focus:ring-2 focus:border-transparent ring-emerald-500 shadow-sm transition-all" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Engine API Key" />
                                </div>
                            </div>

                            {/* Orders Ingestion Rule (Full width below) */}
                            <div className="md:col-span-2 lg:col-span-3 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden p-6 mt-2 relative">
                                <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
                                <h2 className="font-bold text-slate-800 text-base mb-4 flex items-center gap-2"><svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Orders Ingestion Mode</h2>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sync Rule</label>
                                        <select className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm cursor-pointer hover:bg-slate-50 transition-colors bg-white font-medium text-slate-700" value={ordersMode} onChange={(e) => setOrdersMode(e.target.value as OrdersMode)}>
                                            <option value="Disabled">🛑 Do Not Import Orders</option>
                                            <option value="Receive Orders">📥 Import as Draft Orders Only</option>
                                            <option value="Receive + Auto-Create Sales Order">⚡ Import &amp; Auto-create Sales Order</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Fallback Staff Email</label>
                                        <input className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm transition-all bg-white" value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} placeholder="e.g. sales@company.com" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                </fieldset>

                {/* Footer Controls */}
                <div className="flex items-center justify-between pt-8 pb-4 mt-6 border-t border-slate-100">
                    <button
                        type="button"
                        onClick={() => setActiveStep(prev => Math.max(1, prev - 1))}
                        className={`px-6 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-extrabold text-xs transition-all shadow-sm ${activeStep === 1 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                    >
                        &larr; Previous
                    </button>

                    {activeStep < 4 ? (
                        <button
                            type="button"
                            onClick={() => setActiveStep(prev => Math.min(4, prev + 1))}
                            className="px-8 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-extrabold tracking-wide transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 shadow-slate-300"
                        >
                            Next Step &rarr;
                        </button>
                    ) : (
                        <button
                            type="submit"
                            disabled={saving || isLoading || !canUpdate || !isEditing || (!hasChanges && readiness.okCount === 0)}
                            className="px-8 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-extrabold tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:-translate-y-0.5 shadow-purple-300/50 flex items-center gap-2"
                        >
                            {saving ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    Configuring...
                                </>
                            ) : (
                                "Complete Setup & Apply"
                            )}
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
}
