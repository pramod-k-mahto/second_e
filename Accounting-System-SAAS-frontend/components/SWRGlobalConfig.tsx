"use client";

import { SWRConfig } from "swr";
import { api } from "@/lib/api";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function SWRGlobalConfig({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        // Don't re-fetch automatically when user alt-tabs back — accounting
        // data changes via explicit actions, not passive observation.
        revalidateOnFocus: false,
        // Deduplicate identical requests made within 30 s of each other.
        dedupingInterval: 30_000,
        // Keep stale data visible while a background refresh is running.
        revalidateIfStale: true,
        // Retry at most once on error; avoid hammering a temporarily slow API.
        errorRetryCount: 1,
      }}
    >
      {children}
    </SWRConfig>
  );
}
