'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Box, LayoutDashboard, Package, ArrowLeftRight, PieChart, X, Factory, Users } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/inventory', label: 'Inventory', icon: Package },
    { href: '/production', label: 'Production', icon: Factory },
    { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
    { href: '/customers', label: 'Customers', icon: Users },
    { href: '/reports', label: 'Reports', icon: PieChart },
  ];

  return (
    <>
      {/* Backdrop for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-base-950 border-r border-base-800 flex flex-col 
        transition-transform duration-300 ease-in-out
        lg:static lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-base-800">
          <div className="flex items-center">
            <Box className="w-6 h-6 text-white mr-2" />
            <span className="text-lg font-bold text-white tracking-wide">Global Auto Parts</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-white lg:hidden"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {links.map((link) => {
            const isActive = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link 
                key={link.href} 
                href={link.href} 
                onClick={() => onClose()}
                className={`flex items-center px-3 py-2.5 rounded-lg group transition-colors ${
                  isActive 
                    ? 'bg-white text-black' 
                    : 'text-neutral-400 hover:bg-neutral-900 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5 mr-3" />
                <span className="font-medium">{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
