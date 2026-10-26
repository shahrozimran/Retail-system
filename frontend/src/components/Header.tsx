'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowRight, ChevronDown, ChevronRight, LogOut, Menu, Search, ShieldCheck, X } from 'lucide-react';
import { logout } from '@/lib/api';
import { navigation } from '@/lib/navigation';
import ThemeToggle from './ThemeToggle';
import Dialog from './Dialog';

export default function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname().replace(/\/$/, '') || '/';
  const current = navigation.find(item => item.href === pathname);
  const router = useRouter();

  useEffect(() => { document.title = `${current?.label ?? 'Workspace'} · Global Auto Parts`; }, [current?.label]);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!dropdownRef.current?.contains(event.target as Node)) setProfileOpen(false); };
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(open => !open); }
      if (event.key === 'Escape') setProfileOpen(false);
    };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key); };
  }, []);

  async function signOut() {
    setSigningOut(true); setError('');
    try { await logout(); window.location.replace('/login/'); }
    catch { setError('Could not sign out. Please try again.'); setSigningOut(false); }
  }

  return <>
    <header className="min-h-[72px] bg-surface border-b border-line flex items-center gap-4 px-4 md:px-8 shrink-0 safe-top">
      <button className="icon-button lg:hidden shrink-0" aria-label="Open navigation" onClick={onMenuClick}><Menu size={19} /></button>
      <div className="flex items-center gap-2 text-[12px] min-w-0"><span className="hidden sm:inline text-subtle">Workspace</span><ChevronRight size={13} className="text-subtle hidden sm:block" /><span className="font-medium text-ink truncate">{current?.label ?? 'Overview'}</span></div>
      <div className="flex items-center gap-2 sm:gap-3 ml-auto">
        <button onClick={() => { setQuery(''); setSearchOpen(true); }} aria-label="Search pages" className="flex items-center gap-2 text-subtle hover:text-ink sm:border sm:border-line sm:rounded-lg sm:py-2 sm:px-3 text-xs sm:w-52"><Search size={16} /><span className="hidden sm:block">Go to page…</span><kbd className="hidden sm:block ml-auto border border-line rounded px-1 py-0.5 text-[10px]">Ctrl K</kbd></button>
        <ThemeToggle />
        <div className="relative sm:ml-1 sm:pl-4 sm:border-l border-line" ref={dropdownRef}>
          <button onClick={() => setProfileOpen(!profileOpen)} aria-expanded={profileOpen} aria-label="Account menu" className="flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-0.5">
            <span className="w-9 h-9 bg-brand-soft text-brand-ink rounded-full flex items-center justify-center text-xs font-semibold">GA</span>
            <span className="text-left hidden xl:block"><span className="text-xs font-semibold block">Administrator</span><span className="text-[10px] text-subtle block mt-0.5">Workspace owner</span></span><ChevronDown size={13} className="text-subtle hidden sm:block" />
          </button>
          {profileOpen && <div className="absolute right-0 mt-3 w-64 bg-surface border border-line rounded-xl shadow-dialog z-50 animate-in p-2">
            <div className="p-3 mb-1 border-b border-line"><p className="font-semibold text-sm">Workspace administrator</p><p className="text-xs text-subtle mt-1 flex items-center gap-1.5"><ShieldCheck size={13} /> Authorized account</p></div>
            {error && <p role="alert" className="text-xs text-danger p-3">{error}</p>}
            <button onClick={signOut} disabled={signingOut} className="flex gap-2 items-center w-full p-3 text-xs text-danger hover:bg-danger-soft rounded-lg"><LogOut size={15} />{signingOut ? 'Signing out…' : 'Sign out'}</button>
          </div>}
        </div>
      </div>
    </header>
    {searchOpen && <Dialog label="Find a page" onClose={() => setSearchOpen(false)} className="!items-start pt-[15vh]">
      <div className="absolute inset-0 bg-[#091822]/55 backdrop-blur-sm modal-backdrop" onClick={() => setSearchOpen(false)} />
      <div className="relative bg-surface border border-line rounded-2xl shadow-dialog w-full max-w-lg modal-panel overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-line"><Search size={19} className="text-brand-ink" /><input autoFocus aria-label="Search navigation" placeholder="Where would you like to go?" className="flex-1 min-w-0 bg-transparent outline-none text-sm py-1 !shadow-none" value={query} onChange={e => setQuery(e.target.value)} /><button aria-label="Close search" onClick={() => setSearchOpen(false)} className="p-1 text-subtle"><X size={17} /></button></div>
        <div className="p-2 max-h-[55vh] overflow-y-auto">{navigation.filter(item => `${item.label} ${item.description}`.toLowerCase().includes(query.toLowerCase())).map(item => <button key={item.href} onClick={() => { setSearchOpen(false); router.push(item.href); }} className="w-full text-left flex items-center gap-3 p-3 hover:bg-muted rounded-xl group"><span className="p-2.5 rounded-lg bg-muted text-subtle group-hover:text-brand-ink"><item.icon size={18} /></span><span><span className="font-medium text-sm block">{item.label}</span><span className="text-xs text-subtle block mt-0.5">{item.description}</span></span><ArrowRight size={15} className="ml-auto text-subtle" /></button>)}{!navigation.some(item => `${item.label} ${item.description}`.toLowerCase().includes(query.toLowerCase())) && <p className="p-8 text-center text-sm text-subtle">No pages found. Try “inventory” or “reports”.</p>}</div>
        <div className="px-5 py-3 border-t border-line bg-muted text-[10px] text-subtle">Tab to move · Enter to open · Esc to close</div>
      </div>
    </Dialog>}
  </>;
}
