import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getAccountingApiBase() {
    const base = process.env.ACCOUNTING_API_BASE;
    if (!base) throw new Error('ACCOUNTING_API_BASE is not configured');
    return base;
}

function getWebsiteCreds() {
    const apiKey = process.env.WEBSITE_API_KEY;
    const apiSecret = process.env.WEBSITE_API_SECRET;
    if (!apiKey || !apiSecret) throw new Error('Website API credentials are not configured');
    return { apiKey, apiSecret };
}

export async function GET(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
    try {
        const { companyId } = await params;
        const accountingBase = getAccountingApiBase();
        const { apiKey, apiSecret } = getWebsiteCreds();

        const emptyBody = Buffer.from('');
        const signature = crypto.createHmac('sha256', apiSecret).update(emptyBody).digest('hex');

        const upstreamRes = await fetch(`${accountingBase}/website/companies/${companyId}/info`, {
            method: 'GET',
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json',
                'X-Website-Api-Key': apiKey,
                'X-Website-Signature': signature,
            },
        });

        const body = await upstreamRes.text();
        return new Response(body, {
            status: upstreamRes.status,
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
