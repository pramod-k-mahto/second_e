"use client";

import useSWR from 'swr';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, setCurrentCompany, getCompanyLogo, setDefaultLedgers } from '@/lib/api';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function CompanyDetailPage() {
  const params = useParams();
  const companyId = params?.companyId as string;
  const router = useRouter();
  const isValidCompanyId = !!companyId;
  const { data } = useSWR(companyId ? `/companies/${companyId}` : null, fetcher);
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);

  useEffect(() => {
    if (!isValidCompanyId) return;
    if (data?.id && data?.name) {
      const backendLogo = (data as any).logo_url ?? null;
      const localLogo = getCompanyLogo(data.id);
      const companyAddress = (data as any).address ?? null;
      setCurrentCompany({
        id: data.id,
        name: data.name,
        address: companyAddress,
        logo_url: backendLogo || localLogo || null,
      });
      router.push('/dashboard');
    }
  }, [data, router, isValidCompanyId]);

  if (!isValidCompanyId) return null;

  const handleSeed = async () => {
    setSeeding(true);
    setSeedMessage(null);
    setSeedError(null);
    try {
      await api.post(`/companies/${companyId}/seed/default-chart`);
      try {
        const defaultsRes = await api.get(`/companies/${companyId}/default-ledgers`);
        if (defaultsRes?.data && data?.id) {
          setDefaultLedgers(data.id, defaultsRes.data || {});
        }
      } catch {
        // ignore default-ledger fetch failure; user can retry via header
      }
      setSeedMessage('Seeded default chart of accounts successfully.');
    } catch (err: any) {
      setSeedError(err?.response?.data?.detail || 'Failed to seed chart');
    } finally {
      setSeeding(false);
    }
  };

  // While redirecting, render nothing.
  return null;
}
