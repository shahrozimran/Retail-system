'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Box, LayoutDashboard, Package, ArrowLeftRight, PieChart } from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/inventory', label: 'Inventory', icon: Package },
    { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
    { href: '/reports', label: 'Reports', icon: PieChart },
  ];

  return (
    <aside className="w-64 bg-base-950 border-r border-base-800 flex-col hidden md:flex transition-all duration-300">
      <div className="h-16 flex items-center px-6 border-b border-base-800">
        <Box className="w-6 h-6 text-white mr-2" />
        <span className="text-lg font-bold text-white tracking-wide">UMS</span>
      </div>
      <nav className="flex-1 py-4 px-3 space-y-1">
        {links.map((link) => {
          const isActive = pathname === link.href;
          const Icon = link.icon;
          return (
            <Link 
              key={link.href} 
              href={link.href} 
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
  );
}
