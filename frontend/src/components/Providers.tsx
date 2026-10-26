'use client';

import { SWRConfig } from 'swr';
import DesktopToolbar from './DesktopToolbar';
import ThemeProvider from './ThemeProvider';

export default function Providers({ children }: { children: React.ReactNode }) {
  return <ThemeProvider><SWRConfig value={{ revalidateOnFocus: false, revalidateOnReconnect: true, refreshInterval: 60000, dedupingInterval: 10000, shouldRetryOnError: false }}><DesktopToolbar />{children}</SWRConfig></ThemeProvider>;
}
