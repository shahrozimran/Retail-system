import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-base-900/50">
        <Header />
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
