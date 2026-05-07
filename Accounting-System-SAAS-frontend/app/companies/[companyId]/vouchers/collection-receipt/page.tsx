"use client";

import useSWR from 'swr';
import { useParams, useRouter } from 'next/navigation';
import { useState, useMemo, useEffect, FormEvent } from 'react';
import { useToast } from '@/components/ui/Toast';
import {
    api,
    createManualVoucher,
    fetchSalesInvoiceByReference,
    fetchCustomer,
    getApiErrorMessage,
    postVoucherAllocations,
    DepartmentRead,
    CustomerRead,
} from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import {
    Calendar,
    CreditCard,
    Building2,
    ReceiptText,
    PlusCircle,
    Info,
    Wallet,
    Trash2,
    Sparkles
} from "lucide-react";
import { NepaliDatePicker } from 'nepali-datepicker-reactjs';
import {
    CalendarDisplayMode,
    readCalendarDisplayMode,
    writeCalendarDisplayMode,
} from '@/lib/calendarMode';
import { safeADToBS, safeBSToAD } from '@/lib/bsad';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type PaymentMode = {
    id: number;
    name: string;
    ledger_group_id: number;
    is_active: boolean;
};

type CollectionLine = {
    billNo: string;
    customerQuery?: string;
    invoiceId?: number;
    referenceName?: string;
    customReference?: string;
    duesAmount?: number;
    customerLedgerId?: number;
    amountReceived: string;
    isLoading?: boolean;
    error?: string;
};

export default function CollectionReceiptPage() {
    const params = useParams();
    const router = useRouter();
    const companyIdStr = params.companyId as string;
    const companyId = parseInt(companyIdStr, 10);
    const { showToast } = useToast();

    const { data: companySettings } = useSWR<{ company_id: number; calendar_mode: 'AD' | 'BS' }>(
        companyId ? `/companies/${companyId}/settings` : null,
        fetcher
    );
    const isBS = companySettings?.calendar_mode === 'BS';

    const defaultDateDisplayMode: CalendarDisplayMode = isBS ? 'BS' : 'AD';
    const [dateDisplayMode, setDateDisplayMode] = useState<CalendarDisplayMode>(defaultDateDisplayMode);

    useEffect(() => {
        if (!companyId) return;
        const fallback: CalendarDisplayMode = isBS ? 'BS' : 'AD';
        const stored = readCalendarDisplayMode(companyIdStr, fallback);
        setDateDisplayMode(stored);
    }, [companyIdStr, defaultDateDisplayMode, isBS]);

    const [date, setDate] = useState("");
    const [paymentModeId, setPaymentModeId] = useState("");
    const [departmentId, setDepartmentId] = useState("");
    const [projectId, setProjectId] = useState("");
    const [narration, setNarration] = useState("");
    const [lines, setLines] = useState<CollectionLine[]>([
        { billNo: "", customerQuery: "", customReference: "", amountReceived: "" },
    ]);
    const [submitting, setSubmitting] = useState(false);
    const [focusedRow, setFocusedRow] = useState<number | null>(null);

    const [showReprintModal, setShowReprintModal] = useState(false);
    const [reprintSearch, setReprintSearch] = useState("");

    const [isBankModeSelected, setIsBankModeSelected] = useState(false);
    const [isCashModeSelected, setIsCashModeSelected] = useState(false);
    const [selectedBankLedgerId, setSelectedBankLedgerId] = useState<string>('');
    const [ledgerBalance, setLedgerBalance] = useState<number | null>(null);
    const [bankRemark, setBankRemark] = useState('');

    const today = useMemo(() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }, []);

    // Set initial date when isBS or today is ready
    useEffect(() => {

        if (isBS !== undefined) {
            const initial = isBS ? safeADToBS(today) : today;
            if (initial) setDate(initial);
        }
    }, [isBS, today]);

    const handleVoucherDateChangeAD = (ad: string) => {
        if (dateDisplayMode !== 'BOTH') {
            if (!isBS) setDate(ad);
            return;
        }
        if (!isBS) {
            setDate(ad);
            return;
        }
        const bs = safeADToBS(ad);
        if (bs) setDate(bs);
    };

    const handleVoucherDateChangeBS = (bs: string) => {
        if (dateDisplayMode !== 'BOTH') {
            if (isBS) setDate(bs);
            return;
        }
        if (isBS) {
            setDate(bs);
            return;
        }
        const ad = safeBSToAD(bs);
        if (ad) setDate(ad);
    };

    const voucherDatePayload = useMemo(() => {
        if (dateDisplayMode !== 'BOTH') {
            if (isBS) {
                const bs = date;
                const ad = safeBSToAD(bs);
                // Backend requires voucher_date (AD). If we only have BS, we must convert.
                return {
                    voucher_date: ad || today,
                    voucher_date_bs: bs,
                };
            }
            return { voucher_date: date };
        }
        if (isBS) {
            const bs = date;
            const ad = safeBSToAD(bs);
            return {
                voucher_date: ad || today,
                voucher_date_bs: bs,
            };
        }
        const ad = date;
        const bs = safeADToBS(ad);
        return {
            voucher_date: ad,
            ...(bs ? { voucher_date_bs: bs } : {}),
        };
    }, [date, dateDisplayMode, isBS, today]);

    const { data: vouchersResp } = useSWR<any>(
        companyId && showReprintModal ? `/vouchers/companies/${companyId}/vouchers` : null,
        fetcher
    );
    const vouchers = useMemo(() => {
        return vouchersResp?.items || vouchersResp || [];
    }, [vouchersResp]);

    const { data: paymentModesResponse } = useSWR<any>(
        companyId ? `/payment-modes/companies/${companyId}/payment-modes?is_active=true` : null,
        fetcher
    );
    const paymentModes = useMemo<PaymentMode[]>(() => {
        return paymentModesResponse?.items || paymentModesResponse || [];
    }, [paymentModesResponse]);

    const { data: departmentsResponse } = useSWR<any>(
        companyId ? `/companies/${companyId}/departments` : null,
        fetcher
    );
    const departments = useMemo<DepartmentRead[]>(() => {
        return departmentsResponse?.items || departmentsResponse || [];
    }, [departmentsResponse]);

    const { data: projectsResponse } = useSWR<any>(
        companyId ? `/companies/${companyId}/projects` : null,
        fetcher
    );
    const projects = useMemo<any[]>(() => {
        return projectsResponse?.items || projectsResponse || [];
    }, [projectsResponse]);

    const { data: customersResponse } = useSWR<any>(
        companyId ? `/sales/companies/${companyId}/customers` : null,
        fetcher
    );
    const customers = useMemo<CustomerRead[]>(() => {
        return customersResponse?.items || customersResponse || [];
    }, [customersResponse]);

    const { data: ledgers } = useSWR(
        companyId ? `/ledgers/companies/${companyId}/ledgers` : null,
        fetcher
    );

    const { data: ledgerGroups } = useSWR(
        companyId ? `/ledgers/companies/${companyId}/ledger-groups` : null,
        fetcher
    );

    // Mode Detection
    useEffect(() => {

        const mode = paymentModes?.find(pm => String(pm.id) === paymentModeId);
        if (mode) {
            const name = mode.name.toLowerCase();
            const isBank = name.includes('bank');
            setIsBankModeSelected(isBank);
            setIsCashModeSelected(name.includes('cash'));
            if (isBank) {
                // If it's a bank mode, we don't automatically set a ledger ID anymore if it's a group
                // For now, let's just clear it if it's not in the new group.
            } else {
                setSelectedBankLedgerId('');
            }
        } else {
            setIsBankModeSelected(false);
            setIsCashModeSelected(false);
            setSelectedBankLedgerId('');
        }
    }, [paymentModeId, paymentModes]);

    // Fetch Balance
    useEffect(() => {
        let ledgerIdToFetch = '';
        if (isBankModeSelected && selectedBankLedgerId) {
            ledgerIdToFetch = selectedBankLedgerId;
        } else if (isCashModeSelected) {
            const mode = paymentModes?.find(pm => String(pm.id) === paymentModeId);
            // For cash, we still might want a default ledger or selection from group
        }

        if (ledgerIdToFetch && companyId) {
            api.get(`/companies/${companyId}/reports/ledger`, {
                params: {
                    ledger_id: ledgerIdToFetch,
                    from_date: today,
                    to_date: today
                }
            }).then(res => {
                setLedgerBalance(res.data?.closing_balance ?? 0);
            }).catch(() => setLedgerBalance(null));
        } else {
            setLedgerBalance(null);
        }
    }, [isBankModeSelected, selectedBankLedgerId, isCashModeSelected, paymentModeId, paymentModes, companyId, today]);

    const bankLedgers = useMemo(() => {
        if (!ledgers || !paymentModes || !paymentModeId) return [];
        const mode = paymentModes.find(pm => String(pm.id) === paymentModeId);
        if (!mode || !mode.ledger_group_id) {
            if (!ledgerGroups) return [];
            const bankGroups = (ledgerGroups as any[]).filter((g: any) =>
                g.name.toLowerCase().includes('bank') || g.name.toLowerCase().includes('cash & bank')
            ).map((g: any) => g.id);
            return (ledgers as any[]).filter((l: any) => bankGroups.includes(l.group_id));
        }
        return (ledgers as any[]).filter((l: any) => l.group_id === mode.ledger_group_id);
    }, [ledgers, ledgerGroups, paymentModes, paymentModeId]);

    const filteredCustomers = useMemo(() => {
        if (focusedRow === null) return [];
        const line = lines[focusedRow];
        if (!line) return [];
        const query = (line.customerQuery || "").toLowerCase().trim();
        if (!query) return [];
        return customers.filter(c =>
            c.name.toLowerCase().includes(query) ||
            String(c.id).toLowerCase().includes(query)
        ).slice(0, 10);
    }, [customers, lines, focusedRow]);

    const selectCustomer = async (index: number, customer: CustomerRead) => {
        setFocusedRow(null);
        setLines((prev) => {
            const copy = [...prev];
            copy[index] = { ...copy[index], isLoading: true, error: undefined };
            return copy;
        });

        try {
            const today = new Date().toISOString().slice(0, 10);
            const statementUrl = `/companies/${companyId}/reports/customer-statement?customer_id=${customer.id}&from_date=2000-01-01&to_date=${today}`;
            const report = await fetcher(statementUrl);
            const balance = report.closing_balance ?? 0;

            setLines((prev) => {
                const copy = [...prev];
                copy[index] = {
                    ...copy[index],
                    isLoading: false,
                    invoiceId: undefined,
                    billNo: "",
                    referenceName: customer.name,
                    customerQuery: customer.name,
                    customReference: "",
                    customerLedgerId: customer.ledger_id !== null ? customer.ledger_id : undefined,
                    duesAmount: balance,
                };
                return copy;
            });
        } catch (error: any) {
            setLines((prev) => {
                const copy = [...prev];
                copy[index] = { ...copy[index], isLoading: false, customReference: "", error: "Failed to fetch customer dues" };
                return copy;
            });
        }
    };

    const handleBillNoBlur = async (index: number) => {
        const line = lines[index];
        if (!line.billNo || line.billNo.trim() === "") return;

        setLines((prev) => {
            const copy = [...prev];
            copy[index] = { ...copy[index], isLoading: true, error: undefined };
            return copy;
        });

        try {
            let invoice;
            try {
                invoice = await fetchSalesInvoiceByReference(companyId, line.billNo.trim());
            } catch (invErr) {
                // Not found as an invoice, fallthrough
            }

            if (invoice) {
                if (departmentId && invoice.department_id !== Number(departmentId)) {
                    throw new Error("Bill No. belongs to a different department.");
                } else if (!departmentId && invoice.department_id) {
                    throw new Error("Bill No. belongs to a department. Please select the correct department first.");
                }

                let refName = `Customer #${invoice.customer_id}`;
                let customerLedgerId: number | undefined;

                try {
                    const customer = customers.find(c => c.id === invoice?.customer_id);
                    if (customer) {
                        refName = customer.name;
                        customerLedgerId = customer.ledger_id !== null ? customer.ledger_id : undefined;
                    } else {
                        const fetchedCustomer = await fetchCustomer(companyId, invoice.customer_id);
                        refName = fetchedCustomer.name;
                        customerLedgerId = fetchedCustomer.ledger_id !== null ? fetchedCustomer.ledger_id : undefined;
                    }
                } catch (e) {
                    console.warn("Could not fetch customer for invoice", e);
                }

                setLines((prev) => {
                    const copy = [...prev];
                    copy[index] = {
                        ...copy[index],
                        isLoading: false,
                        invoiceId: invoice?.id,
                        referenceName: refName,
                        customerQuery: refName,
                        customReference: invoice?.custom_reference || "",
                        customerLedgerId: customerLedgerId,
                        duesAmount: invoice?.outstanding_amount || 0,
                    };
                    return copy;
                });
                return;
            }

            // Fallback: search as Customer Name/ID
            const query = line.billNo.trim().toLowerCase();
            const matchingCustomer = customers.find(
                c => c.name.toLowerCase().includes(query) || String(c.id) === query
            );

            if (!matchingCustomer) {
                throw new Error("Invoice or Customer not found");
            }
            if (!matchingCustomer.ledger_id) {
                throw new Error("Customer has no linked ledger");
            }

            const today = new Date().toISOString().slice(0, 10);
            const statementUrl = `/companies/${companyId}/reports/customer-statement?customer_id=${matchingCustomer.id}&from_date=2000-01-01&to_date=${today}`;
            const report = await fetcher(statementUrl);
            const dues = report.closing_balance && report.closing_balance > 0 ? report.closing_balance : 0;

            setLines((prev) => {
                const copy = [...prev];
                copy[index] = {
                    ...copy[index],
                    isLoading: false,
                    invoiceId: undefined, // No attached invoice
                    referenceName: matchingCustomer.name,
                    customerQuery: matchingCustomer.name,
                    customReference: "",
                    customerLedgerId: matchingCustomer.ledger_id !== null ? matchingCustomer.ledger_id : undefined,
                    duesAmount: dues,
                };
                return copy;
            });
        } catch (error: any) {
            const errorMsg = error.message || "Invoice or Customer not found";
            setLines((prev) => {
                const copy = [...prev];
                copy[index] = {
                    ...copy[index],
                    isLoading: false,
                    invoiceId: undefined,
                    referenceName: undefined,
                    customReference: "",
                    duesAmount: undefined,
                    customerLedgerId: undefined,
                    error: errorMsg,
                };
                return copy;
            });
        }
    };

    const handleCustomerBlur = async (index: number) => {
        const line = lines[index];
        const query = (line.customerQuery || "").trim().toLowerCase();

        if (!query) {
            if (!line.referenceName) return;
        }
        if (query === (line.referenceName || "").toLowerCase()) return;

        setLines((prev) => {
            const copy = [...prev];
            copy[index] = { ...copy[index], isLoading: true, error: undefined };
            return copy;
        });

        try {
            const matchingCustomer = customers.find(
                c => c.name.toLowerCase().includes(query) || String(c.id) === query
            );

            if (!matchingCustomer) {
                throw new Error("Customer not found");
            }
            if (!matchingCustomer.ledger_id) {
                throw new Error("Customer has no linked ledger");
            }

            const today = new Date().toISOString().slice(0, 10);
            const statementUrl = `/companies/${companyId}/reports/customer-statement?customer_id=${matchingCustomer.id}&from_date=2000-01-01&to_date=${today}`;
            const report = await fetcher(statementUrl);
            const dues = report.closing_balance && report.closing_balance > 0 ? report.closing_balance : 0;

            setLines((prev) => {
                const copy = [...prev];
                copy[index] = {
                    ...copy[index],
                    isLoading: false,
                    invoiceId: undefined,
                    billNo: "",
                    referenceName: matchingCustomer.name,
                    customerQuery: matchingCustomer.name,
                    customReference: "",
                    customerLedgerId: matchingCustomer.ledger_id !== null ? matchingCustomer.ledger_id : undefined,
                    duesAmount: dues,
                };
                return copy;
            });
        } catch (error: any) {
            const errorMsg = error.message || "Customer not found";
            setLines((prev) => {
                const copy = [...prev];
                copy[index] = {
                    ...copy[index],
                    isLoading: false,
                    invoiceId: undefined,
                    referenceName: undefined,
                    customReference: "",
                    customerLedgerId: undefined,
                    duesAmount: undefined,
                    error: errorMsg,
                };
                return copy;
            });
        }
    };

    const handleLineChange = (index: number, field: keyof CollectionLine, value: any) => {
        setLines((prev) => {
            const copy = [...prev];
            copy[index] = { ...copy[index], [field]: value };
            return copy;
        });
    };

    const addLine = () => {
        setLines((prev) => [...prev, { billNo: "", customerQuery: "", customReference: "", amountReceived: "" }]);
    };

    const removeLine = (index: number) => {
        setLines((prev) => prev.filter((_, i) => i !== index));
    };

    const totalReceived = useMemo(() => {
        return lines.reduce((acc, line) => acc + (parseFloat(line.amountReceived) || 0), 0);
    }, [lines]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!paymentModeId) {
            showToast({ title: "Validation Error", description: "Payment Mode is required", variant: "error" });
            return;
        }

        const validLines = lines.filter(l => parseFloat(l.amountReceived) > 0 && l.customerLedgerId);
        if (validLines.length === 0) {
            showToast({ title: "Validation Error", description: "At least one valid line with an amount received is required", variant: "error" });
            return;
        }

        setSubmitting(true);

        // Backdate warning
        const todayStr = new Date().toISOString().split('T')[0];
        const compareDate = isBS ? safeBSToAD(date) : date;
        if (compareDate && compareDate < todayStr) {
            if (typeof window !== "undefined") {
                const ok = window.confirm(
                    `The transaction date (${date}) is a back date (before today, ${todayStr}). Do you want to proceed?`
                );
                if (!ok) {
                    setSubmitting(false);
                    return;
                }
            }
        }

        try {
            const selectedPaymentMode = paymentModes?.find(pm => String(pm.id) === paymentModeId);
            if (!selectedPaymentMode) throw new Error("Invalid payment mode");

            // We use createManualVoucher to specify multiple lines.
            // Bank / Cash is DEBITED for the total amount received.
            // Customer Ledgers are CREDITED for their respective amounts.
            const voucherLines = [];

            const finalLedgerId = isBankModeSelected && selectedBankLedgerId ? Number(selectedBankLedgerId) : 0; // Fallback to 0 if not selected
            if (!finalLedgerId) {
                showToast({ title: "Validation Error", description: "Please select a specific ledger for the payment mode", variant: "error" });
                setSubmitting(false);
                return;
            }

            // Add the debit line for the payment mode
            voucherLines.push({
                ledger_id: finalLedgerId,
                debit: totalReceived,
                credit: 0,
                department_id: departmentId ? Number(departmentId) : null,
                project_id: projectId ? Number(projectId) : null,
            });

            // Add credit lines for customers
            for (const line of validLines) {
                voucherLines.push({
                    ledger_id: line.customerLedgerId!,
                    debit: 0,
                    credit: parseFloat(line.amountReceived),
                    department_id: departmentId ? Number(departmentId) : null,
                    project_id: projectId ? Number(projectId) : null,
                    remarks: line.invoiceId ? `Collection for Bill No: ${line.billNo}` : `Collection for Customer: ${line.referenceName}`
                });
            }


            const payload = {
                ...voucherDatePayload,
                voucher_type: "RECEIPT" as const,
                narration: narration || `Collection Receipt - Total ${totalReceived}`,
                bank_remark: bankRemark,
                payment_mode_id: Number(paymentModeId),
                department_id: departmentId ? Number(departmentId) : null,
                project_id: projectId ? Number(projectId) : null,
                lines: voucherLines,
            };

            const voucher = await createManualVoucher(companyId, payload);

            // Now create allocations only for explicitly mapped invoices
            const allocations = validLines
                .filter(l => l.invoiceId)
                .map((l) => ({
                    doc_type: "SALES_INVOICE" as const,
                    doc_id: l.invoiceId!,
                    amount: parseFloat(l.amountReceived),
                }));

            if (allocations.length > 0) {
                await postVoucherAllocations(companyId, voucher.id, allocations);
            }

            showToast({ title: "Success", description: "Collection Receipt created successfully", variant: "success" });

            // Reset form for new transaction
            setLines([{ billNo: "", customerQuery: "", customReference: "", amountReceived: "" }]);
            setNarration("");

        } catch (error: any) {
            const msg = getApiErrorMessage(error);
            showToast({ title: "Error", description: msg, variant: "error" });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* ── Hero Header ────────────────────────────────────────────────── */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
                <div className="h-[3px] w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-2">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
                            <ReceiptText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                            <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Collection Receipt</h1>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                                Record customer payments directly against sales invoices or on account
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 rounded-md border border-indigo-100 dark:border-indigo-800/40 bg-indigo-50 dark:bg-indigo-900/20 px-2.5 py-1">
                            <svg className="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                            </svg>
                            <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-400">
                                {totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="relative rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-[2px] shadow-lg mb-8">
                <div className="border-none bg-surface-light dark:bg-slate-950 rounded-xl overflow-hidden">
                    {/* Action Bar within Form Card */}
                    <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">

                        <button
                            type="button"
                            onClick={() => router.push(`/companies/${companyId}/vouchers`)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold border border-rose-200 transition-colors"
                        >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                            Cancel
                        </button>

                        <button
                            form="collection-form"
                            type="submit"
                            disabled={submitting || totalReceived === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-50"
                        >
                            {submitting ? (
                                <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/50 border-t-transparent" />
                            ) : (
                                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                            )}
                            Save
                        </button>

                        <div className="ml-auto flex items-center gap-2">
                            {/* Re-Print */}
                            <button
                                type="button"
                                title="Re-Print a voucher"
                                onClick={() => { setReprintSearch(""); setShowReprintModal(true); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-600 active:bg-teal-700 text-white text-xs font-semibold shadow-sm transition-all duration-150"
                            >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v1a1 1 0 001 1h8a1 1 0 001-1v-1h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9a1 1 0 011-1h6a1 1 0 011 1v3H6v-3zm8-5a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" /></svg>
                                Re-Print
                            </button>

                            <button
                                type="button"
                                onClick={() => router.push('/dashboard')}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
                            >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" /></svg>
                                Exit
                            </button>
                            <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/50">
                                ✦ New Entry
                            </span>
                        </div>
                    </div>

                    <div className="overflow-hidden">
                        <div className="h-[3px] w-full bg-blue-500" />
                        <div className="p-4 sm:p-5">
                            {/* Summary Header */}
                            <div className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-blue-200 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-900/30 px-4 py-3">
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-white dark:bg-slate-900">
                                        <svg className="w-4 h-4 text-blue-700 dark:text-blue-300" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="rounded-full border bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">RECEIPT</span>
                                            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">New Voucher</h2>
                                        </div>
                                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                            Fill in the collection details below or use Bill No to auto-fetch.
                                         </p>
                                    </div>
                                </div>
                            </div>

                            {/* Form Fields Section */}
                            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="block text-xs font-semibold text-slate-600 mb-1 ml-1 flex items-center gap-1">
                                        <Calendar size={13} className="text-blue-500" />
                                        Date
                                    </label>
                                    {dateDisplayMode === 'BOTH' ? (
                                        <div className="flex flex-row gap-2">
                                            <div className="relative flex-1">
                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500 pointer-events-none z-10">AD</span>
                                                <Input
                                                    type="date"
                                                    forceNative={false}
                                                    className="h-9 w-full pl-8 text-xs text-center"
                                                    value={isBS ? safeBSToAD(date) || '' : date}
                                                    onChange={(e) => handleVoucherDateChangeAD(e.target.value)}
                                                    required
                                                />
                                            </div>
                                            <div className="relative flex-1">
                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500 pointer-events-none z-10">BS</span>
                                                <Input
                                                    type="date"
                                                    calendarMode="BS"
                                                    forceNative={false}
                                                    className="h-9 w-full pl-8 text-xs text-center"
                                                    value={isBS ? date : safeADToBS(date) || ''}
                                                    onChange={(e) => handleVoucherDateChangeBS(e.target.value)}
                                                    required
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <Input
                                            type="date"
                                            calendarMode={isBS ? 'BS' : 'AD'}
                                            forceNative={false}
                                            value={date}
                                            onChange={(e) => setDate(e.target.value)}
                                            required
                                            className="h-9 w-full text-xs text-center"
                                        />
                                    )}
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label className="block text-xs font-semibold text-slate-600 mb-1 ml-1 flex items-center gap-1">
                                        <Building2 size={13} className="text-indigo-500" />
                                        Department
                                    </label>
                                    <Select
                                        value={departmentId}
                                        onChange={(e) => setDepartmentId(e.target.value)}
                                        className="h-9 w-full text-xs font-medium"
                                    >
                                        <option value="">None</option>
                                        {departments?.map((d) => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </Select>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label className="block text-xs font-semibold text-slate-600 mb-1 ml-1 flex items-center gap-1">
                                        <Building2 size={13} className="text-emerald-500" />
                                        Project
                                    </label>
                                    <Select
                                        value={projectId}
                                        onChange={(e) => setProjectId(e.target.value)}
                                        className="h-9 w-full text-xs font-medium"
                                    >
                                        <option value="">None</option>
                                        {projects?.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </Select>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label className="block text-xs font-semibold text-slate-600 mb-1 ml-1 flex items-center gap-1">
                                        <CreditCard size={13} className="text-purple-500" />
                                        {isCashModeSelected ? 'Mode & Balance' : 'Payment Mode'}
                                    </label>
                                    <div className="flex gap-2">
                                        <Select
                                            value={paymentModeId}
                                            onChange={(e) => setPaymentModeId(e.target.value)}
                                            required
                                            className="h-9 flex-1 text-xs font-medium"
                                        >
                                            <option value="">Select Mode...</option>
                                            {paymentModes?.map((pm) => (
                                                <option key={pm.id} value={pm.id}>{pm.name}</option>
                                            ))}
                                        </Select>
                                        {isCashModeSelected && (
                                            <div className="h-9 flex items-center px-3 rounded-md bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-300 shadow-sm whitespace-nowrap min-w-[100px] transition-all">
                                                {ledgerBalance !== null ? `${Math.abs(ledgerBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ledgerBalance >= 0 ? 'Dr' : 'Cr'}` : '—'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {isBankModeSelected && (
                                <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="flex flex-col gap-1.5 transition-all sm:col-span-1">
                                        <label className="block text-xs font-semibold text-slate-600 mb-1 ml-1 flex items-center gap-1">
                                            <Building2 size={13} className="text-blue-500" />
                                            Bank Account & Balance
                                        </label>
                                        <div className="flex gap-2">
                                            <Select
                                                value={selectedBankLedgerId}
                                                onChange={(e) => setSelectedBankLedgerId(e.target.value)}
                                                className="h-9 flex-1 text-xs"
                                            >
                                                {bankLedgers.map((bl: any) => (
                                                    <option key={bl.id} value={bl.id}>{bl.name}</option>
                                                ))}
                                            </Select>
                                            <div className="h-9 flex items-center px-3 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-xs font-bold text-blue-700 dark:text-blue-300 shadow-sm whitespace-nowrap min-w-[100px] transition-all">
                                                {ledgerBalance !== null ? `${Math.abs(ledgerBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ledgerBalance >= 0 ? 'Dr' : 'Cr'}` : '—'}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                                        <label className="block text-xs font-semibold text-slate-600 mb-1 ml-1 flex items-center gap-1">
                                            <Info size={13} className="text-indigo-500" />
                                            Bank Remarks
                                        </label>
                                        <Input
                                            placeholder="Cheque no / Reference / Note..."
                                            value={bankRemark}
                                            onChange={(e) => setBankRemark(e.target.value)}
                                            className="h-9 text-xs"
                                        />
                                    </div>
                                </div>
                            )}

                            <form id="collection-form" onSubmit={handleSubmit} className="space-y-5 text-sm">
                                <div className="flex flex-col gap-6">
                                    <div className="space-y-2">
                                        <div className="overflow-hidden rounded-xl border border-blue-200 dark:border-blue-800/40 bg-white shadow-sm dark:bg-slate-950">
                                            <div className="flex items-center justify-between border-b border-blue-200 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-900/30 px-4 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <svg className="w-3.5 h-3.5 text-blue-700 dark:text-blue-300" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                                                    </svg>
                                                    <span className="text-xs font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Voucher Lines</span>
                                                </div>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="min-w-[760px] w-full text-xs">
                                                    <thead className="border-b border-blue-200 dark:border-blue-800/40">
                                                        <tr className="bg-blue-50 dark:bg-blue-900/30 text-[11px] uppercase tracking-wide">
                                                            <th className="px-3 py-2.5 text-left font-bold text-blue-700 dark:text-blue-300 w-[18%]">Bill No.</th>
                                                            <th className="px-3 py-2.5 text-left font-bold text-blue-700 dark:text-blue-300 w-[22%]">Customer</th>
                                                            <th className="px-3 py-2.5 text-left font-bold text-blue-700 dark:text-blue-300 w-[18%]">Reference</th>
                                                            <th className="px-3 py-2.5 text-right font-bold text-blue-700 dark:text-blue-300 w-[18%]">Dues Amount</th>
                                                            <th className="px-3 py-2.5 text-right font-bold text-blue-700 dark:text-blue-300 w-[18%]">Amount Received</th>
                                                            <th className="px-3 py-2.5 text-center font-bold text-blue-700 dark:text-blue-300 w-10"><span className="sr-only">Actions</span></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {lines.map((line, idx) => (
                                                            <tr key={idx} className="border-b last:border-none dark:border-slate-800">
                                                                <td className="px-3 py-2 align-top">
                                                                    <div className="relative">
                                                                        <Input
                                                                            value={line.billNo}
                                                                            onChange={(e) => handleLineChange(idx, "billNo", e.target.value)}
                                                                            onBlur={() => handleBillNoBlur(idx)}
                                                                            placeholder="INV-..."
                                                                            className="h-8 w-full text-xs"
                                                                        />
                                                                        {line.isLoading && (
                                                                            <span className="absolute right-2 top-1/2 -translate-y-1/2">
                                                                                <div className="animate-spin h-3.5 w-3.5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-3 py-2 align-top overflow-visible relative">
                                                                    <div className="relative">
                                                                        <Input
                                                                            value={line.customerQuery !== undefined ? line.customerQuery : (line.referenceName || "")}
                                                                            onChange={(e) => handleLineChange(idx, "customerQuery", e.target.value)}
                                                                            onFocus={() => setFocusedRow(idx)}
                                                                            onBlur={() => {
                                                                                setTimeout(() => setFocusedRow(null), 200);
                                                                                handleCustomerBlur(idx);
                                                                            }}
                                                                            placeholder="Search Name/ID..."
                                                                            className="h-8 w-full pl-8 text-xs font-semibold text-blue-700"
                                                                        />
                                                                        <Wallet className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-400 opacity-60 pointer-events-none" />

                                                                        {focusedRow === idx && filteredCustomers.length > 0 && (
                                                                            <div className="absolute top-full left-0 z-[100] mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-xl max-h-48 overflow-auto">
                                                                                {filteredCustomers.map((c) => (
                                                                                    <button
                                                                                        key={c.id}
                                                                                        type="button"
                                                                                        onMouseDown={() => selectCustomer(idx, c)}
                                                                                        className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/40 border-b border-slate-50 dark:border-slate-800 last:border-0"
                                                                                    >
                                                                                        <div className="text-xs font-bold">{c.name}</div>
                                                                                        <div className="text-[10px] text-slate-400">ID: {c.id}</div>
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-3 py-2 align-top">
                                                                    <div className="h-8 flex items-center px-2 bg-slate-50/50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800 rounded text-[11px] font-medium text-slate-700">
                                                                        {line.customReference || <span className="opacity-30 italic">N/A</span>}
                                                                    </div>
                                                                </td>
                                                                <td className="px-3 py-2 align-top text-right font-bold text-slate-600 text-xs">
                                                                    {line.duesAmount !== undefined ? (
                                                                        <span className={line.duesAmount >= 0 ? "text-slate-600" : "text-rose-600"}>
                                                                            {Math.abs(line.duesAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {line.duesAmount >= 0 ? 'Dr' : 'Cr'}
                                                                        </span>
                                                                    ) : (
                                                                        "0.00 Dr"
                                                                    )}
                                                                </td>
                                                                <td className="px-3 py-2 align-top">
                                                                    <div className="relative">
                                                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-blue-400">$</span>
                                                                        <Input
                                                                            type="number"
                                                                            value={line.amountReceived}
                                                                            onChange={(e) => handleLineChange(idx, "amountReceived", e.target.value)}
                                                                            className="h-8 w-full pl-6 text-right text-xs font-bold text-blue-600 bg-blue-50/30 border-blue-100"
                                                                            disabled={!line.customerLedgerId}
                                                                        />
                                                                    </div>
                                                                </td>
                                                                <td className="px-3 py-2 align-top text-center w-10">
                                                                    {lines.length > 1 && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => removeLine(idx)}
                                                                            className="mt-1 rounded border border-rose-200/60 bg-rose-50 p-1 text-rose-500 hover:bg-rose-100 hover:text-rose-700 transition-colors"
                                                                            title="Remove Line"
                                                                        >
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                    <tfoot className="border-t-2 border-blue-200 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-900/30 text-[11px]">
                                                        <tr>
                                                            <td colSpan={4} className="px-3 py-2.5 text-right text-xs font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                                                                Total
                                                            </td>
                                                            <td className="px-3 py-2.5 text-right font-black tabular-nums text-slate-800 dark:text-slate-100 text-sm">
                                                                {totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </td>
                                                            <td></td>
                                                        </tr>
                                                    </tfoot>
                                                </table>
                                            </div>
                                        </div>

                                        <div className="mt-3 flex flex-col gap-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between dark:text-slate-300">
                                            <div className="flex flex-wrap gap-2">
                                                <button type="button" onClick={addLine}
                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:opacity-80 transition-opacity">
                                                    <PlusCircle className="w-3.5 h-3.5" />
                                                    Add line
                                                </button>
                                            </div>
                                        </div>

                                    </div>

                                    {/* Bottom panel: Display Summary below Entry Section */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Narration</label>
                                            <textarea
                                                rows={4}
                                                value={narration}
                                                onChange={(e) => setNarration(e.target.value)}
                                                className="w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                                placeholder="Optional notes about this voucher…"
                                            />
                                        </div>

                                        <div className="space-y-3 rounded-xl border border-blue-200 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-900/30 p-4 text-xs shadow-sm self-start">
                                            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">Summary</div>
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-3 py-2">
                                                    <span className="text-slate-500 dark:text-slate-400">Total Allocation</span>
                                                    <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">{totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ Re-Print Modal ═══ */}
            {showReprintModal && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowReprintModal(false); }}
                >
                    <div className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {/* Modal header */}
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-teal-500" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v1a1 1 0 001 1h8a1 1 0 001-1v-1h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9a1 1 0 011-1h6a1 1 0 011 1v3H6v-3zm8-5a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" />
                                </svg>
                                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Re-Print a Voucher</span>
                            </div>
                            <button type="button" onClick={() => setShowReprintModal(false)}
                                className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </div>

                        {/* Search bar */}
                        <div className="px-5 pt-4 pb-2">
                            <div className="relative">
                                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                                </svg>
                                <input autoFocus type="text" placeholder="Search by voucher #, type or party..."
                                    className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-400 placeholder-slate-400"
                                    value={reprintSearch} onChange={(e) => setReprintSearch(e.target.value)} />
                            </div>
                            <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                                Showing <span className="font-semibold text-teal-600">RECEIPT</span> vouchers — click <strong>View &amp; Print</strong> to open in a new tab.
                            </p>
                        </div>

                        {/* Voucher list */}
                        <div className="px-5 pb-5 max-h-80 overflow-y-auto">
                            {(() => {
                                const q = reprintSearch.trim().toLowerCase();
                                const modalVouchers = (vouchers as any[] || []).filter((v: any) => {
                                    if (String(v?.voucher_type || '') !== 'RECEIPT') return false;
                                    if (!q) return true;
                                    const num = String(v?.voucher_number || '').toLowerCase();
                                    const idStr = String(v?.id || '').toLowerCase();
                                    return num.includes(q) || idStr.includes(q);
                                });
                                if (!vouchersResp && showReprintModal) return (
                                    <div className="flex items-center gap-2 py-6 text-xs text-slate-400 justify-center">
                                        <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
                                        Loading vouchers...
                                    </div>
                                );
                                if (modalVouchers.length === 0) return (
                                    <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                                        No vouchers found matching your search.
                                    </div>
                                );
                                return (
                                    <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-100 dark:border-slate-800 overflow-hidden mt-1">
                                        {modalVouchers.map((v: any) => {
                                            const amount = Number(v?.total_amount || 0);
                                            const vDate = String(v?.voucher_date || '');
                                            return (
                                                <div key={v.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-white dark:bg-slate-900 hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-colors border-l-2 border-transparent hover:border-teal-500">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-[11px] font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 rounded px-1.5 py-0.5 border border-teal-100 dark:border-teal-800/40">
                                                                {v.voucher_number || `#${v.id}`}
                                                            </span>
                                                            <span className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 text-[9px] font-bold text-indigo-600 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800/40 uppercase tracking-tighter">
                                                                {v.voucher_type}
                                                            </span>
                                                        </div>
                                                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                                                            <span>{vDate}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                                            {amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </span>
                                                        <a href={`/companies/${companyId}/vouchers/${v.id}`}
                                                            target="_blank" rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-teal-500 hover:bg-teal-600 text-white text-[11px] font-semibold shadow-sm transition-colors">
                                                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v1a1 1 0 001 1h8a1 1 0 001-1v-1h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9a1 1 0 011-1h6a1 1 0 011 1v3H6v-3zm8-5a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" />
                                                            </svg>
                                                            Print
                                                        </a>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

}
