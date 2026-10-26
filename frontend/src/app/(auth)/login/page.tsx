'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowUpRight, Eye, EyeOff, Factory, Loader2, LockKeyhole, Package, ShieldCheck, ShoppingBag } from 'lucide-react';
import { login } from '@/lib/api';
import { DESKTOP } from '@/lib/desktop';
import Brand from '@/components/Brand';
import ThemeToggle from '@/components/ThemeToggle';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault(); setIsLoading(true); setError('');
    try { await login(email, password); setPassword(''); router.replace('/'); if (!DESKTOP) router.refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Sign in failed.'); }
    finally { setIsLoading(false); }
  }

  return <main className={`grid lg:grid-cols-[.95fr_1.05fr] bg-surface ${DESKTOP ? 'min-h-[calc(100dvh-2.25rem)]' : 'min-h-dvh'}`}>
    <section className="hidden lg:flex flex-col justify-between bg-[#142b32] p-10 xl:p-14 relative overflow-hidden">
      <Brand inverse />
      <div className="relative py-14 max-w-lg mx-auto w-full fade-in">
        <span className="inline-flex items-center gap-2 text-[#85d7c8] text-[11px] font-medium uppercase tracking-[.16em] mb-7"><span className="w-5 h-px bg-[#85d7c8]" /> Built for the everyday</span>
        <h2 className="text-[44px] xl:text-[54px] leading-[1.12] font-semibold tracking-[-.045em] text-white">Your business.<br />Everything in view.</h2>
        <p className="text-[#a6bfc5] text-[15px] leading-7 mt-6 max-w-sm">From the materials you receive to the sales you make. Keep your entire operation moving in one connected workspace.</p>
        <div className="mt-12 border border-[#ffffff15] bg-[#ffffff04] rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#ffffff10] flex items-center justify-between"><span className="text-[10px] tracking-[.14em] uppercase text-[#91adb5]">A connected workflow</span><ArrowUpRight size={15} className="text-[#64d1bd]" /></div>
          <div className="p-5 space-y-4 stagger">{[{ icon: Package, label: 'Inventory', detail: 'Know what you have.' }, { icon: Factory, label: 'Production', detail: 'Plan what comes next.' }, { icon: ShoppingBag, label: 'Sales & accounts', detail: 'See where you stand.' }].map((item, i) => <div key={item.label} className="flex items-center gap-4"><span className="flex items-center justify-center h-10 w-10 rounded-xl border border-[#ffffff14] text-[#64d1bd]"><item.icon size={18} strokeWidth={1.6} /></span><div><p className="text-[#e3edef] text-[13px] font-medium">{item.label}</p><p className="text-[#91adb5] text-[11px] mt-0.5">{item.detail}</p></div><span className="ml-auto text-[10px] font-mono text-[#78979f]">0{i + 1}</span></div>)}</div>
        </div>
      </div>
      <p className="text-[#78979f] text-[11px]">Global Auto Parts · Business management, made clear.</p>
    </section>
    <section className="flex flex-col p-5 sm:p-8 lg:p-10 min-w-0">
      <div className="flex items-center justify-between"><div className="lg:hidden"><Brand /></div><span className="hidden lg:block section-label">Your workspace awaits</span><ThemeToggle /></div>
      <div className="flex-1 flex items-center justify-center py-12 sm:py-16">
        <div className="w-full max-w-[360px] fade-in">
          <span className="inline-flex w-11 h-11 rounded-xl bg-brand-soft text-brand-ink items-center justify-center mb-6"><LockKeyhole size={22} strokeWidth={1.6} /></span>
          <h1 className="text-[30px] font-semibold tracking-tight">Welcome back</h1>
          <p className="text-subtle text-sm mt-2 mb-8">Sign in to your Global Auto Parts workspace.</p>
          <form onSubmit={handleLogin} className="space-y-5">
            {error && <div id="login-error" role="alert" className="bg-danger-soft border border-danger/20 text-danger px-4 py-3 rounded-lg text-sm">{error}</div>}
            <div><label htmlFor="login-email" className="field-label">Email address</label><input id="login-email" type="email" required autoComplete="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} className="field" placeholder="you@example.com" aria-describedby={error ? 'login-error' : undefined} /></div>
            <div><label htmlFor="login-password" className="field-label">Password</label><div className="relative"><input id="login-password" type={showPassword ? 'text' : 'password'} required autoComplete="current-password" maxLength={1024} value={password} onChange={e => setPassword(e.target.value)} className="field !pr-12" placeholder="Enter your password" aria-describedby={error ? 'login-error' : undefined} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)} className="absolute right-1 top-1 bottom-1 w-10 flex items-center justify-center rounded-md text-subtle hover:text-ink">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>
            <button type="submit" disabled={isLoading} className="btn-primary w-full !py-3 mt-2 disabled:opacity-60">{isLoading ? <><Loader2 size={17} className="animate-spin" /> Signing in…</> : <>Sign in to workspace <ArrowRight size={17} className="ml-auto" /></>}</button>
          </form>
          <div className="flex items-center gap-2.5 mt-8 pt-6 border-t border-line text-xs text-subtle leading-relaxed"><ShieldCheck size={17} className="shrink-0 text-brand-ink" /><p>This workspace is available to authorized administrators only.</p></div>
        </div>
      </div>
      <p className="text-center text-[11px] text-subtle">A single workspace. A clearer working day.</p>
    </section>
  </main>;
}
