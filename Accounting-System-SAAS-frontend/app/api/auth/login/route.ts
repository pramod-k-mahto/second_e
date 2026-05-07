import { cookies } from 'next/headers';

function getApiBase() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE;
  if (!base) {
    throw new Error('API base URL is not configured');
  }
  return base;
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const email = formData.get('email');
  const password = formData.get('password');

  if (!email || !password) {
    return new Response(JSON.stringify({ detail: 'Email and password are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const base = getApiBase();

  const body = new URLSearchParams();
  body.append('username', String(email));
  body.append('password', String(password));

  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Login failed');
    return new Response(text, { status: res.status });
  }

  const data = (await res.json()) as { access_token?: string; token_type?: string; license_warning?: string };
  if (!data.access_token) {
    return new Response(JSON.stringify({ detail: 'No access_token in response' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cookieStore = await cookies();
  
  const backendCookies = res.headers.getSetCookie();

  // We still manually set our local auth_token cookie
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
    JSON.stringify({ 
      access_token: data.access_token, 
      token_type: data.token_type ?? 'bearer',
      license_warning: data.license_warning
    }),
    {
      status: 200,
      headers: responseHeaders,
    }
  );
}
