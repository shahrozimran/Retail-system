'use client';

import { useCallback, useState } from 'react';
import { usePathname } from 'next/navigation';
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
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);
  const pathname = usePathname();

  if (!ready) return <div className="min-h-[80vh] flex flex-col items-center justify-center gap-4" role="status"><div className="w-9 h-9 border-2 border-line border-t-brand rounded-full animate-spin" /><p className="text-subtle text-sm">Opening your workspace…</p></div>;

  return (
    <div className={`flex w-full overflow-hidden ${DESKTOP ? 'min-h-[calc(100dvh-2.25rem)]' : 'min-h-screen'}`}>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />
      <main className={`flex-1 min-w-0 flex flex-col overflow-hidden bg-canvas ${DESKTOP ? 'h-[calc(100dvh-2.25rem)]' : 'h-dvh'}`}>
        <Header onMenuClick={() => setIsSidebarOpen(true)} />
        <div id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto overscroll-contain p-4 md:p-6 lg:p-8 pb-10">
          <div key={pathname} className="page-content">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
