'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMounted } from '@/hooks/useMounted';

export default function Dialog({ children, onClose, label, className = '', busy = false }: { children: React.ReactNode; onClose: () => void; label: string; className?: string; busy?: boolean }) {
  const mounted = useMounted();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => { closeRef.current = onClose; busyRef.current = busy; }, [onClose, busy]);
  useEffect(() => {
    if (!mounted) return;
    const trigger = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => (focusable().find(el => el.hasAttribute('autofocus')) ?? focusable().find(el => ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) ?? focusable()[0] ?? panel)?.focus());
    function onKey(event: KeyboardEvent) {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== panel) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busyRef.current) closeRef.current(); }
      if (event.key === 'Tab') {
        const items = focusable(), first = items[0], last = items.at(-1);
        if (!first) { event.preventDefault(); panel?.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !panel?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !panel?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', onKey); if (trigger?.isConnected) trigger.focus(); };
  }, [mounted]);
  if (!mounted) return null;
  return createPortal(<div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={`fixed inset-0 z-[100] flex items-center justify-center p-4 ${className}`}>{children}</div>, document.body);
}
