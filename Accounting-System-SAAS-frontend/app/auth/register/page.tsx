"use client";

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

const extractErrorMessage = (detail: any, fallback: string): string => {
  if (!detail) return fallback;

  if (Array.isArray(detail)) {
    return detail
      .map((e: any) => {
        if (typeof e === 'string') return e;
        if (e?.msg) return e.msg;
        try {
          return JSON.stringify(e);
        } catch {
          return '';
        }
      })
      .filter(Boolean)
      .join('; ');
  }

  if (typeof detail === 'string') return detail;
  if (detail?.msg) return detail.msg;

  try {
    if (typeof detail === 'object') {
      return JSON.stringify(detail);
    }
  } catch {
    // ignore
  }

  return fallback;
};

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      setLoading(false);
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must contain both letters and numbers.');
      setLoading(false);
      return;
    }
    try {
      await api.post('/auth/register', {
        email,
        full_name: fullName || null,
        password,
        confirm_password: password,
        role: 'user',
        tenant_id: null,
      });
      router.push('/auth/login');
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(extractErrorMessage(detail, 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white shadow rounded p-8">
      <h1 className="text-xl font-semibold mb-4">Register</h1>
      <p className="text-xs text-slate-600 mb-4">
        Register your company to unlock smart accounting, billing, and reports.
      </p>
      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm mb-1">Full Name</label>
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Email</label>
          <input
            type="email"
            className="w-full border rounded px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Password</label>
          <input
            type="password"
            className="w-full border rounded px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-slate-900 text-white py-2 rounded text-sm hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? 'Registering...' : 'Register'}
        </button>
        <p className="text-xs text-slate-500 mt-2 text-center">
          Already have an account?{' '}
          <a href="/auth/login" className="text-slate-900 underline">
            Login
          </a>
        </p>
      </form>
    </div>
  );
}
