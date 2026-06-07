'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Client-side auth guard.
 * Replaces the Next.js middleware (proxy.ts) which doesn't run in a static/Capacitor export.
 * Call this at the top of any protected layout or page component.
 */
export function useAuthGuard() {
  const router = useRouter();

  useEffect(() => {
    const hasCookie = document.cookie
      .split(';')
      .some((c) => c.trim().startsWith('auth_token=true'));

    if (!hasCookie) {
      router.replace('/login');
    }
  }, [router]);
}
