'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, PanelLeftClose, ShieldCheck } from 'lucide-react';
import { useEffect, useRef } from 'react';
import Brand from './Brand';
import { navigation } from '@/lib/navigation';
import { DESKTOP } from '@/lib/desktop';

export default function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname().replace(/\/$/, '') || '/';
  const sidebarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const sync = () => {
      if (!sidebarRef.current) return;
      const hidden = !isOpen && !media.matches;
      sidebarRef.current.inert = hidden;
      sidebarRef.current.setAttribute('aria-hidden', String(hidden));
    };
    sync(); media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement;
    sidebarRef.current?.querySelector<HTMLElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (window.matchMedia('(min-width: 1024px)').matches) return;
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const items = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('a, button') ?? []);
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, [isOpen, onClose]);

  return <>
    {isOpen && <div className="fixed inset-0 bg-[#091822]/60 backdrop-blur-sm z-40 lg:hidden modal-backdrop" onClick={onClose} />}
    <aside ref={sidebarRef} aria-label="Main navigation" className={`app-sidebar fixed inset-y-0 left-0 z-50 w-[244px] shrink-0 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="h-[88px] px-5 flex items-center justify-between shrink-0">
        <Link href="/" aria-label="Global Auto Parts overview"><Brand inverse /></Link>
        <button aria-label="Close navigation" className="lg:hidden p-1.5 text-[#b5cdd2]" onClick={onClose}><PanelLeftClose size={19} /></button>
      </div>
      <div className="mx-5 h-px bg-[#ffffff10]" />
      <nav className="flex-1 px-3 pt-7 space-y-7 overflow-y-auto">
        {['Workspace', 'Business'].map(group => <div key={group}>
          <p className="px-4 mb-3 text-[10px] uppercase tracking-[.16em] text-[#78979f] font-semibold">{group}</p>
          <div className="space-y-1">{navigation.filter(link => link.group === group).map(link => <Link key={link.href} href={link.href} onClick={onClose} aria-current={pathname === link.href ? 'page' : undefined} data-active={pathname === link.href} className="nav-link flex items-center gap-3 px-4 py-3 rounded-lg text-[13px] font-medium">
            <link.icon size={18} strokeWidth={1.7} /><span>{link.label}</span>
            {pathname === link.href && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#64d1bd]" />}
          </Link>)}</div>
        </div>)}
      </nav>
      <div className="m-4 mt-6 rounded-xl border border-[#ffffff10] p-4 bg-[#ffffff04]">
        <div className="flex gap-2 items-center text-[12px] text-[#dcebea] font-medium"><ShieldCheck size={15} className="text-[#64d1bd]" /> Your business, connected</div>
        <p className="text-[11px] leading-relaxed text-[#91adb5] mt-2">One workspace for stock, sales and customer accounts.</p>
        {DESKTOP && <a href="https://retail-system-chi.vercel.app" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-[#64d1bd] mt-3">Open web app <ArrowUpRight size={12} /></a>}
      </div>
      <div className="px-6 pb-5 text-[10px] text-[#78979f]">Global Auto Parts · Retail management</div>
    </aside>
  </>;
}
