'use client';

import { SWRConfig } from 'swr';
import DesktopToolbar from './DesktopToolbar';

export default function Providers({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ revalidateOnFocus: false, revalidateOnReconnect: true, refreshInterval: 60000, dedupingInterval: 10000, shouldRetryOnError: false }}><DesktopToolbar />{children}</SWRConfig>;
}
