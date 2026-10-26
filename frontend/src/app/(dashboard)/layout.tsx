'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { DESKTOP } from '@/lib/desktop';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ready = useAuthGuard();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  if (!ready) return <div className="p-8 text-neutral-400">Verifying session...</div>;

  return (
    <div className={`flex w-full overflow-hidden ${DESKTOP ? 'min-h-[calc(100dvh-2.25rem)]' : 'min-h-screen'}`}>
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <main className={`flex-1 flex flex-col overflow-hidden bg-base-900/50 ${DESKTOP ? 'h-[calc(100dvh-2.25rem)]' : 'h-screen'}`}>
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
