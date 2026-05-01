'use client';

import { Inter } from 'next/font/google';
import { SWRConfig } from 'swr';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.className} bg-base-950 text-white antialiased min-h-screen`} suppressHydrationWarning>
        <SWRConfig 
          value={{
            revalidateOnFocus: false,
            revalidateOnReconnect: true,
            refreshInterval: 60000, // Refresh every 1 minute
            dedupingInterval: 10000, // Dedup requests within 10 seconds
            shouldRetryOnError: false
          }}
        >
          {children}
        </SWRConfig>
      </body>
    </html>
  );
}
