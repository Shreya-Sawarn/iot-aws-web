'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { Eye, EyeOff, Radio } from 'lucide-react';

type Step = 'request' | 'reset';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const router = useRouter();

  const {
    forgotPassword, confirmForgotPassword,
    isLoading, error, infoMessage, devVerificationCode, clearError,
  } = useAuthStore();

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    const success = await forgotPassword(email);
    if (success) setStep('reset');
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (newPassword !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }
    const success = await confirmForgotPassword(email, code, newPassword);
    if (success) router.push('/login');
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-10 justify-center">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
            <Radio className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold text-white">OrbiPulse</span>
        </div>

        {step === 'request' ? (
          <>
            <h2 className="text-2xl font-bold text-white mb-1 text-center">Reset your password</h2>
            <p className="text-slate-400 text-sm mb-8 text-center">
              Enter your email and we&apos;ll send you a reset code
            </p>

            <form onSubmit={handleRequest} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); clearError(); }}
                  placeholder="you@example.com"
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 mt-2"
              >
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send reset instructions'
                )}
              </button>
            </form>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-white mb-1 text-center">Set a new password</h2>
            <p className="text-slate-400 text-sm mb-8 text-center">
              Enter the reset code sent to <span className="text-slate-300">{email}</span>
            </p>

            {devVerificationCode && (
              <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs">
                Phase-1 dev mode (no email delivery yet) — your reset code is{' '}
                <span className="font-mono font-bold">{devVerificationCode}</span>
              </div>
            )}

            <form onSubmit={handleReset} className="space-y-4">
              {infoMessage && !error && !formError && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                  {infoMessage}
                </div>
              )}
              {(formError || error) && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {formError ?? error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Reset code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={e => { setCode(e.target.value); clearError(); }}
                  placeholder="6-digit code"
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all text-sm tracking-widest"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">New password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => { setNewPassword(e.target.value); clearError(); setFormError(null); }}
                    placeholder="At least 8 characters"
                    required
                    minLength={8}
                    className="w-full px-4 py-2.5 pr-12 rounded-xl bg-slate-800/60 border border-slate-700/60 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirm new password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); setFormError(null); }}
                  placeholder="Re-enter your new password"
                  required
                  minLength={8}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 mt-2"
              >
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Resetting...
                  </>
                ) : (
                  'Reset password'
                )}
              </button>
            </form>
          </>
        )}

        <p className="text-center text-sm text-slate-400 mt-6">
          <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
            ← Back to sign in
          </Link>
        </p>

        <p className="text-center text-xs text-slate-600 mt-8">
          OrbiPulse v1.0 · E-Actuell Labs Private Limited · Udupi, India
        </p>
      </div>
    </div>
  );
}
