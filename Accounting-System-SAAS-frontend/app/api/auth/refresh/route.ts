import { cookies } from 'next/headers';

function getApiBase() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE;
  if (!base) throw new Error('API base URL is not configured');
  return base;
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const authToken = cookieStore.get('auth_token');

  if (!authToken?.value) {
    return new Response(JSON.stringify({ detail: 'No auth token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const base = getApiBase();
  const allCookies = req.headers.get('cookie') || '';

  // Try the backend refresh endpoint — FastAPI typically exposes POST /auth/refresh
  // It accepts the current (possibly near-expiry) Bearer token and issues a new one.
  try {
    const res = await fetch(`${base}/auth/refresh`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken.value}`,
        'Content-Type': 'application/json',
        Cookie: allCookies, // Forward all cookies including refresh_token if any
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[auth/refresh] Backend rejected refresh:', res.status, errText);
      return new Response(JSON.stringify({ detail: 'Refresh rejected by backend' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = (await res.json()) as { access_token?: string; token_type?: string };
    if (!data.access_token) {
      return new Response(JSON.stringify({ detail: 'No access_token in refresh response' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const backendCookies = res.headers.getSetCookie();

    // Renew the httpOnly cookie with the new token
    cookieStore.set('auth_token', data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    const responseHeaders = new Headers({
      'Content-Type': 'application/json'
    });
    
    if (backendCookies && backendCookies.length > 0) {
      backendCookies.forEach((cookie) => {
        // Modify the path of refresh_token so that the browser sends it to our Next.js backend
        if (cookie.startsWith('refresh_token=')) {
          const modifiedCookie = cookie.replace(/path=\/auth\/refresh/i, 'Path=/api/auth/refresh');
          responseHeaders.append('Set-Cookie', modifiedCookie);
        } else {
          responseHeaders.append('Set-Cookie', cookie);
        }
      });
    }

    return new Response(
      JSON.stringify({ access_token: data.access_token, token_type: data.token_type ?? 'bearer' }),
      {
        status: 200,
        headers: responseHeaders,
      }
    );
  } catch {
    return new Response(JSON.stringify({ detail: 'Refresh request failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
