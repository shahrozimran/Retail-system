'use client';

import { Box, Bell } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default function Header() {
  return (
    <header className="h-16 bg-base-950/50 backdrop-blur-sm border-b border-base-800 flex items-center justify-between px-6 z-10 sticky top-0">
      <div className="flex items-center md:hidden">
        <Box className="w-6 h-6 text-white mr-2" />
        <span className="text-lg font-bold text-white">UMS</span>
      </div>
      <div className="hidden md:block">
        {/* Can put breadcrumbs or current page title here if needed */}
      </div>
      <div className="flex items-center space-x-4 ml-auto">
        {!API_URL && (
          <span className="text-xs bg-red-900/50 text-red-400 px-3 py-1 rounded-full border border-red-900 hidden sm:inline-block">
            API_URL missing
          </span>
        )}
        <button className="p-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 transition-colors">
          <Bell className="w-5 h-5" />
        </button>
        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-black font-bold shadow-lg">
          A
        </div>
      </div>
    </header>
  );
}
