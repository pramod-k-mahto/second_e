import type { WebsiteOrderCreate, WebsiteOrderResult } from '@/types/websiteOrder';

export type WebsiteOrderSubmitResponse = {
  idempotencyKey: string;
  data: WebsiteOrderResult;
};

export async function submitWebsiteOrder(
  companyId: number | string,
  order: WebsiteOrderCreate,
  opts?: { idempotencyKey?: string }
): Promise<WebsiteOrderSubmitResponse> {
  const idempotencyKey = opts?.idempotencyKey || globalThis.crypto?.randomUUID?.() || String(Date.now());

  const res = await fetch(`/api/website/companies/${companyId}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(order),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Request failed');
    const err = new Error(`Website order failed ${res.status}: ${text}`);
    (err as any).status = res.status;
    (err as any).body = text;
    throw err;
  }

  const data = (await res.json()) as WebsiteOrderSubmitResponse;
  return data;
}

export function isRetryableWebsiteOrderError(err: unknown): boolean {
  const status = (err as any)?.status;
  if (typeof status === 'number') return status >= 500;
  return true;
}
