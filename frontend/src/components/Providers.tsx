'use client';

import { SWRConfig } from 'swr';

export default function Providers({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ revalidateOnFocus: false, revalidateOnReconnect: true, refreshInterval: 60000, dedupingInterval: 10000, shouldRetryOnError: false }}>{children}</SWRConfig>;
}
