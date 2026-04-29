import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'

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
      <body className={`${inter.className} bg-base-950 text-white antialiased min-h-screen flex overflow-hidden`} suppressHydrationWarning>
        <Sidebar />
        <main className="flex-1 flex flex-col h-screen overflow-hidden bg-base-900/50">
          <Header />
          <div className="flex-1 overflow-y-auto p-6">
            {children}
          </div>
        </main>
      </body>
    </html>
  )
}
