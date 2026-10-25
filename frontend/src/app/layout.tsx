import { headers } from 'next/headers';
import Providers from '@/components/Providers';
import './globals.css';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Request-time rendering lets Next attach the proxy's CSP nonce to its scripts.
  if (process.env.CAPACITOR_BUILD !== '1') await headers();
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
        />
      </head>
      <body className="font-sans bg-base-950 text-white antialiased min-h-screen" suppressHydrationWarning>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
