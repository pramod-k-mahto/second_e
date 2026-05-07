import crypto from 'crypto';
import { Metadata } from 'next';
import StoreProductClient from './StoreProductClient';

type Props = {
    params: Promise<{ companyId: string; itemId: string }>;
};

// Next.js App Router metadata generation for Open Graph preview
export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { companyId, itemId } = await params;

    try {
        // We hit our own API proxy here using an absolute URL because generateMetadata runs on the server.
        // In strict Next.js, we can't easily fetch our own app/api routes during build if we don't have a fully qualified URL.
        // Instead of doing `fetch(absolute_url)`, let's fetch directly using the same logic as the route!
        // But since `ACCOUNTING_API_BASE` is available internally, we can fetch directly to the backend.

        const accountingBase = process.env.ACCOUNTING_API_BASE;
        const apiKey = process.env.WEBSITE_API_KEY;
        const apiSecret = process.env.WEBSITE_API_SECRET;

        if (accountingBase && apiKey && apiSecret) {
            const signature = crypto.createHmac('sha256', apiSecret).update(Buffer.from('')).digest('hex');

            const res = await fetch(`${accountingBase}/website/companies/${companyId}/items/${itemId}`, {
                method: 'GET',
                cache: 'no-store',
                headers: {
                    'X-Website-Api-Key': apiKey,
                    'X-Website-Signature': signature,
                },
            });

            if (res.ok) {
                const item = await res.json();

                const priceDisplay = item.default_sales_rate || item.mrp || 0;
                const desc = `Price: NPR ${priceDisplay.toLocaleString()} - ${item.description || `Buy ${item.name} today.`}`;

                return {
                    title: item.name,
                    description: desc,
                    openGraph: {
                        title: item.name,
                        description: desc,
                        images: item.image_url ? [{ url: item.image_url }] : [],
                        type: 'website',
                    },
                };
            }
        }
    } catch (err) {
        // fail silently to default metadata
    }

    return {
        title: 'Product Store',
        description: 'Check out this product.',
    };
}

export default async function StoreProductPage({ params }: Props) {
    const { companyId, itemId } = await params;
    return <StoreProductClient companyId={companyId} itemId={itemId} />;
}
