'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { Eye, EyeOff, Wifi, Radio, Shield } from 'lucide-react';

const DEMO_ACCOUNTS = [
  { email: 'admin@orbipulse.com', password: 'Admin@123', role: 'Founder / Admin', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  { email: 'farmer@orbipulse.com', password: 'Farmer@123', role: 'Farmer', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  { email: 'operator@orbipulse.com', password: 'Operator@123', role: 'Municipal Operator', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
];

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const { login, isLoading, error, clearError } = useAuthStore();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const success = await login(email, password);
    if (success) router.push('/dashboard');
  }

  function fillDemo(demoEmail: string, demoPassword: string) {
    setEmail(demoEmail);
    setPassword(demoPassword);
    clearError();
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
            Monitor and control OrbiDrive actuators across agricultural and municipal installations.
            Pure LTE connectivity. Real-time telemetry. Safe command execution.
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

      {/* Right Panel — Login Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <Radio className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-white">OrbiPulse</span>
          </div>

          <h2 className="text-2xl font-bold text-white mb-1">Sign in</h2>
          <p className="text-slate-400 text-sm mb-8">Access your IoT control dashboard</p>

          {/* Demo Accounts */}
          <div className="mb-6 p-4 rounded-xl bg-slate-800/40 border border-slate-700/50">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-3 font-medium">Demo Accounts</p>
            <div className="flex flex-col gap-2">
              {DEMO_ACCOUNTS.map(acc => (
                <button
                  key={acc.email}
                  onClick={() => fillDemo(acc.email, acc.password)}
                  className={`text-left px-3 py-2 rounded-lg border text-xs font-medium transition-all hover:opacity-90 ${acc.color}`}
                >
                  <span className="block font-semibold">{acc.role}</span>
                  <span className="opacity-70">{acc.email}</span>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); clearError(); }}
                  placeholder="••••••••"
                  required
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

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 mt-2"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in to OrbiPulse'
              )}
            </button>
          </form>

          <p className="text-center text-xs text-slate-600 mt-8">
            OrbiPulse v1.0 · E-Actuell Labs Private Limited · Udupi, India
          </p>
        </div>
      </div>
    </div>
  );
}
