import crypto from 'crypto';

function getAccountingApiBase() {
  const base = process.env.ACCOUNTING_API_BASE;
  if (!base) {
    throw new Error('ACCOUNTING_API_BASE is not configured');
  }
  return base;
}

function getWebsiteCreds() {
  const apiKey = process.env.WEBSITE_API_KEY;
  const apiSecret = process.env.WEBSITE_API_SECRET;

  if (!apiKey) {
    throw new Error('WEBSITE_API_KEY is not configured');
  }
  if (!apiSecret) {
    throw new Error('WEBSITE_API_SECRET is not configured');
  }

  return { apiKey, apiSecret };
}

export async function POST(req: Request, { params }: { params: { companyId: string } }) {
  try {
    const { companyId } = params;
    if (!companyId) {
      return new Response(JSON.stringify({ detail: 'companyId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const idempotencyKey = req.headers.get('Idempotency-Key') || crypto.randomUUID();

    const accountingBase = getAccountingApiBase();
    const { apiKey, apiSecret } = getWebsiteCreds();

    const orderRawBytes = Buffer.from(await req.arrayBuffer());
    const signature = crypto.createHmac('sha256', apiSecret).update(orderRawBytes).digest('hex');

    const url = `${accountingBase}/website/companies/${companyId}/orders`;

    const upstreamRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Website-Api-Key': apiKey,
        'X-Website-Signature': signature,
        'Idempotency-Key': idempotencyKey,
      },
      body: orderRawBytes,
    });

    if (!upstreamRes.ok) {
      const text = await upstreamRes.text().catch(() => 'Accounting API request failed');
      return new Response(text, { status: upstreamRes.status });
    }

    const data = await upstreamRes.json();

    return new Response(JSON.stringify({ idempotencyKey, data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const detail = process.env.NODE_ENV === 'production' ? 'Server error' : (err?.message || 'Server error');
    return new Response(JSON.stringify({ detail }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
