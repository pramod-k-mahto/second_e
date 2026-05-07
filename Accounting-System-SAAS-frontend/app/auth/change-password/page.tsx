"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, setToken } from "@/lib/api";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{
    current_password?: string;
    new_password?: string;
    confirm_new_password?: string;
  }>({});
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function checkAuth() {
      try {
        await api.get("/auth/me");
      } catch (err: any) {
        const status = err?.response?.status;
        if (!cancelled && status === 401) {
          setToken(null);
          router.replace("/auth/login");
        }
      }
    }
    checkAuth();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const validate = () => {
    const nextFieldError: typeof fieldError = {};
    if (!currentPassword) {
      nextFieldError.current_password = "Current password is required";
    }
    if (!newPassword) {
      nextFieldError.new_password = "New password is required";
    }
    if (!confirmNewPassword) {
      nextFieldError.confirm_new_password = "Please confirm your new password";
    }
    if (newPassword && confirmNewPassword && newPassword !== confirmNewPassword) {
      nextFieldError.confirm_new_password = "Passwords do not match";
    }
    setFieldError(nextFieldError);
    return Object.keys(nextFieldError).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setFieldError({});
    if (!validate()) return;

    setLoading(true);
    try {
      await api.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setToken(null);
      setSuccess("Password updated successfully. Please log in again with your new password.");
      router.replace("/auth/login?changedPassword=1");
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail || "Failed to change password";
      if (status === 401) {
        setToken(null);
        router.replace("/auth/login");
        return;
      }
      const nextFieldError: typeof fieldError = {};
      if (
        detail === "Current password is incorrect." ||
        detail.toLowerCase().includes("current password")
      ) {
        nextFieldError.current_password = detail;
      } else if (
        detail === "Password must be at least 8 characters long and contain both letters and numbers." ||
        detail.toLowerCase().includes("at least 8 characters")
      ) {
        nextFieldError.new_password = detail;
      }

      if (Object.keys(nextFieldError).length > 0) {
        setFieldError(nextFieldError);
      } else {
        setError(detail);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white shadow rounded p-8">
      <h1 className="text-xl font-semibold mb-4">Change Password</h1>
      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}
      {success && <div className="mb-4 text-sm text-green-700">{success}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm mb-1">Current Password</label>
          <input
            type="password"
            className="w-full border rounded px-3 py-2 text-sm"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          {fieldError.current_password && (
            <p className="mt-1 text-xs text-red-600">{fieldError.current_password}</p>
          )}
        </div>
        <div>
          <label className="block text-sm mb-1">New Password</label>
          <input
            type="password"
            className="w-full border rounded px-3 py-2 text-sm"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          {fieldError.new_password && (
            <p className="mt-1 text-xs text-red-600">{fieldError.new_password}</p>
          )}
        </div>
        <div>
          <label className="block text-sm mb-1">Confirm New Password</label>
          <input
            type="password"
            className="w-full border rounded px-3 py-2 text-sm"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            required
          />
          {fieldError.confirm_new_password && (
            <p className="mt-1 text-xs text-red-600">{fieldError.confirm_new_password}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-slate-900 text-white py-2 rounded text-sm hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? "Changing password..." : "Change Password"}
        </button>
      </form>
    </div>
  );
}
