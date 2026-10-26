import { headers } from 'next/headers';
import type { Metadata, Viewport } from 'next';
import Providers from '@/components/Providers';
import { themeBootstrap } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Global Auto Parts',
  description: 'Your connected workspace for inventory, production, sales and customer accounts.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Request-time rendering lets Next attach the proxy's CSP nonce to its scripts.
  const nonce = process.env.CAPACITOR_BUILD !== '1' ? (await headers()).get('x-nonce') ?? undefined : undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="font-sans antialiased min-h-screen" suppressHydrationWarning>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
