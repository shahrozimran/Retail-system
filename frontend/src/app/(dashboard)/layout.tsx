'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex w-full min-h-screen overflow-hidden">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-base-900/50">
        <Header onMenuClick={() => setIsSidebarOpen(true)} />
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
