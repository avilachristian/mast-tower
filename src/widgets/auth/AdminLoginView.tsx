import { useState } from 'react';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Lock,
  RadioTower,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { navigateTo } from '@/shared/lib/router';
import { useAuthStore } from '@/shared/state/authStore';

export function AdminLoginView() {
  const login = useAuthStore((s) => s.login);
  const checking = useAuthStore((s) => s.checking);
  const errorMessage = useAuthStore((s) => s.errorMessage);
  const clearError = useAuthStore((s) => s.clearError);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    await login(username.trim(), password);
  };

  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col justify-between p-4 sm:p-6">
      <div className="max-w-5xl w-full mx-auto flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigateTo('/')}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition cursor-pointer shadow-2xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Client Showcase</span>
        </button>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-200/70 text-[11px] font-semibold text-slate-700">
          <Lock className="w-3 h-3 text-slate-500" />
          Admin Access Only
        </span>
      </div>

      <div className="max-w-md w-full mx-auto my-8">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-lg p-6 sm:p-8 space-y-6">
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white flex items-center justify-center shadow-sm">
              <RadioTower className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">
                Mast 2 Tower — Admin Portal
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Sign in to create projects, log daily site reports, upload photos to R2, and control what clients see.
              </p>
            </div>
          </div>

          {isOffline && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 flex items-start gap-2.5 text-xs text-amber-900">
              <WifiOff className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">You appear to be offline</div>
                <p className="mt-0.5 text-amber-800">
                  Signing in for the first time requires an active internet connection to verify your admin session.
                </p>
              </div>
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
            >
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-700">
                Admin Username
              </span>
              <input
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => {
                  clearError();
                  setUsername(e.target.value);
                }}
                placeholder="Enter admin username"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 focus:outline-none"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-700">
                Password
              </span>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => {
                    clearError();
                    setPassword(e.target.value);
                  }}
                  placeholder="Enter admin password"
                  className="w-full rounded-xl border border-slate-300 bg-white pl-3.5 pr-10 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </label>

            <button
              type="submit"
              disabled={checking || !username.trim() || !password}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 px-4 shadow-sm transition cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{checking ? 'Signing in...' : 'Sign In to Workspace'}</span>
            </button>
          </form>
        </div>
      </div>

      <p className="text-center text-[11px] text-slate-400">
        Cloudflare D1 + R2 Protected Field Reporting System
      </p>
    </div>
  );
}
