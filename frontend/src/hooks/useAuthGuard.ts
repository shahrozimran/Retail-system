'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { hasSession } from '@/lib/api';

/**
 * UI gate only. Every API request independently verifies the backend session.
 */
export function useAuthGuard() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    hasSession().then(valid => {
      if (!active) return;
      if (valid) setReady(true);
      else router.replace('/login/');
    }).catch(() => { if (active) router.replace('/login/'); });
    return () => { active = false; };
  }, [router]);
  return ready;
}
