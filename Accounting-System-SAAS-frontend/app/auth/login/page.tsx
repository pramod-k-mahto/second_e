"use client";

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, setToken, scheduleTokenRefresh } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const changedPassword = searchParams.get('changedPassword') === '1';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('username', email);
      formData.append('password', password);

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        let message = 'Login failed';
        try {
          const text = await res.text();
          if (text) {
            try {
              const json = JSON.parse(text);
              message = json.detail || message;
            } catch {
              message = text;
            }
          }
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      const data = (await res.json().catch(() => null)) as
        | { access_token?: string; token_type?: string; license_warning?: string }
        | null;
      if (data?.access_token) {
        setToken(data.access_token);
        scheduleTokenRefresh(data.access_token);
      }

      if (data?.license_warning) {
        alert(data.license_warning);
      }

      // auth_token cookie and access_token storage are now set; navigate to companies list
      try {
        const companiesRes = await api.get('/companies/');
        const companies = companiesRes?.data as any[] | undefined;

        if (Array.isArray(companies) && companies.length > 0) {
          const sorted = [...companies].filter((c) => c && typeof c.id === 'number').sort((a, b) => a.id - b.id);
          const target = sorted[0] ?? companies[0];

          if (target && target.id) {
            router.push(`/companies/${target.id}`);
          } else {
            router.push('/companies');
          }
        } else {
          router.push('/companies');
        }
      } catch {
        router.push('/companies');
      }
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-slate-100 overflow-hidden">
      {/* Left Side: Branding / Background */}
      <div className="relative hidden w-0 flex-1 lg:block bg-slate-950">
        <div className="absolute inset-0 h-full w-full overflow-hidden">
          {/* Decorative glowing orbs */}
          <div className="absolute -top-[20%] -left-[10%] h-[60%] w-[60%] rounded-full bg-indigo-500/20 blur-[120px]" />
          <div className="absolute top-[60%] right-[0%] h-[70%] w-[50%] rounded-full bg-sky-500/10 blur-[100px]" />

          <div className="absolute inset-0 flex flex-col justify-center px-16 lg:px-24 z-10">
            <div className="mb-8 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 shadow-xl border border-indigo-400/20">
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-white mb-6 leading-tight">
              Prixna ERP Pro <br /> Manage your business with simplicity.
            </h1>
            <p className="text-base text-slate-400 max-w-lg leading-relaxed font-medium">
              Prixna ERP Pro gives you powerful double-entry features, inventory tracking, and beautiful insights. Get back to growing your business.
            </p>
          </div>
        </div>
      </div>

      {/* Right Side: Login Form */}
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24 bg-white shadow-2xl z-20 overflow-y-auto">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          <div className="lg:hidden text-center mb-10">
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 shadow-md mb-4">
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            </div>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Prixna ERP Pro</h2>
            <h3 className="mt-2 text-lg font-bold text-slate-700 tracking-tight">Sign in</h3>
            <p className="mt-1 text-sm text-slate-500 font-medium">
              Welcome back! Please enter your details.
            </p>
          </div>

          <div className="hidden lg:block mb-8">
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Sign in to Prixna ERP Pro</h2>
            <p className="mt-2 text-sm text-slate-500 font-medium">
              Welcome back! Please enter your details.
            </p>
          </div>

          <div className="mt-8">
            {changedPassword && (
              <div className="mb-6 rounded-xl bg-emerald-50/80 p-4 border border-emerald-200/50 shadow-sm backdrop-blur-sm">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-semibold text-emerald-800">Password changed</h3>
                    <div className="mt-1 text-sm text-emerald-600 font-medium">
                      <p>Successfully updated. Please log in with your new password.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="mb-6 rounded-xl bg-red-50/80 p-4 border border-red-200/50 shadow-sm backdrop-blur-sm">
                <div className="flex">
                  <div className="flex-shrink-0 animate-pulse">
                    <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-semibold text-red-800">Authentication error</h3>
                    <div className="mt-1 text-sm text-red-600 font-medium">
                      <p>{error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5 cursor-default">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Email address
                </label>
                <div className="mt-1 relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                    </svg>
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full appearance-none rounded-xl border border-slate-300/80 bg-slate-50/50 pl-10 pr-4 py-3 text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10 sm:text-sm transition duration-200 ease-in-out font-medium"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="mt-1 relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full appearance-none rounded-xl border border-slate-300/80 bg-slate-50/50 pl-10 pr-4 py-3 text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10 sm:text-sm transition duration-200 ease-in-out font-medium"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-sm font-medium text-slate-600 cursor-pointer">
                    Remember me
                  </label>
                </div>

                <div className="text-sm">
                  <a href="#" className="font-semibold text-indigo-600 hover:text-indigo-500 transition-colors">
                    Forgot password?
                  </a>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="group relative flex w-full justify-center rounded-xl border border-transparent bg-slate-900 px-4 py-3.5 text-sm font-bold text-white shadow-md hover:bg-slate-800 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-slate-900/10 disabled:opacity-70 disabled:cursor-not-allowed transition-all duration-200 ease-in-out"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Signing in...
                    </span>
                  ) : (
                    'Sign in'
                  )}
                </button>
              </div>

              <div className="pt-4 text-center">
                <p className="text-sm text-slate-500 font-medium">
                  Don&apos;t have an account?{' '}
                  <a href="/auth/register" className="font-bold text-slate-900 hover:text-indigo-600 transition-colors">
                    Register for free
                  </a>
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
