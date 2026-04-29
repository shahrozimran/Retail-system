import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Unified Management System',
  description: 'Manage inventory, transactions, and finances.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.className} bg-base-950 text-white antialiased min-h-screen`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
