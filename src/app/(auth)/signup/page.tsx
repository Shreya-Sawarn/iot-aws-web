'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { Eye, EyeOff, Wifi, Radio, Shield } from 'lucide-react';

type Step = 'details' | 'verify';

export default function SignUpPage() {
  const [step, setStep] = useState<Step>('details');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const router = useRouter();

  const {
    signUp, confirmSignUp, resendVerificationCode,
    isLoading, error, infoMessage, devVerificationCode, clearError,
  } = useAuthStore();

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }
    const success = await signUp(email, password);
    if (success) setStep('verify');
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    const success = await confirmSignUp(email, code);
    if (success) router.push('/login');
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] flex">
      {/* Left Panel — Branding */}
      <div className="hidden lg:flex lg:flex-1 flex-col justify-between p-12 bg-gradient-to-br from-[#0f1629] to-[#0a0e1a] border-r border-slate-800/50">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
              <Radio className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">OrbiPulse</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">by E-Actuell Labs Private Limited</p>
        </div>

        <div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Industrial IoT<br />
            <span className="text-blue-400">Valve Control</span><br />
            Platform
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed max-w-md">
            Create an account to monitor and control OrbiDrive actuators across your sites.
            Access and roles are configured by your organization after sign-up.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: Wifi, label: 'Pure LTE', sub: 'No WiFi dependency' },
            { icon: Shield, label: 'Safe ACK', sub: 'No false success' },
            { icon: Radio, label: 'Real-time', sub: '5-sec telemetry' },
          ].map(({ icon: Icon, label, sub }) => (
            <div key={label} className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
              <Icon className="w-5 h-5 text-blue-400 mb-2" />
              <div className="text-sm font-medium text-white">{label}</div>
              <div className="text-xs text-slate-500">{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel — Sign Up Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <Radio className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-white">OrbiPulse</span>
          </div>

          {step === 'details' ? (
            <>
              <h2 className="text-2xl font-bold text-white mb-1">Create your account</h2>
              <p className="text-slate-400 text-sm mb-8">Sign up with your email and password</p>

              <form onSubmit={handleSignUp} className="space-y-4">
                {(formError || error) && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    {formError ?? error}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Email address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); clearError(); setFormError(null); }}
                    placeholder="you@example.com"
                    required
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => { setPassword(e.target.value); clearError(); setFormError(null); }}
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
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirm password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => { setConfirmPassword(e.target.value); setFormError(null); }}
                    placeholder="Re-enter your password"
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
                      Creating account...
                    </>
                  ) : (
                    'Sign up'
                  )}
                </button>
              </form>

              <p className="text-center text-sm text-slate-400 mt-6">
                Already have an account?{' '}
                <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
                  Sign in
                </Link>
              </p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-white mb-1">Verify your email</h2>
              <p className="text-slate-400 text-sm mb-8">
                Enter the verification code sent to <span className="text-slate-300">{email}</span>
              </p>

              {devVerificationCode && (
                <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs">
                  Phase-1 dev mode (no email delivery yet) — your code is{' '}
                  <span className="font-mono font-bold">{devVerificationCode}</span>
                </div>
              )}

              <form onSubmit={handleVerify} className="space-y-4">
                {infoMessage && !error && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                    {infoMessage}
                  </div>
                )}
                {error && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Verification code</label>
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

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 mt-2"
                >
                  {isLoading ? (
                    <>
                      <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify email'
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => resendVerificationCode(email)}
                  className="w-full text-center text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Resend code
                </button>
              </form>
            </>
          )}

          <p className="text-center text-xs text-slate-600 mt-8">
            OrbiPulse v1.0 · E-Actuell Labs Private Limited · Udupi, India
          </p>
        </div>
      </div>
    </div>
  );
}
