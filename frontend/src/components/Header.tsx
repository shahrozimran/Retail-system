'use client';

import { Box, Bell, LogOut, User as UserIcon, Menu } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    // Clear the auth cookie
    document.cookie = "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    // Redirect to login
    router.push('/login');
  };

  return (
    <header className="h-16 bg-base-950/50 backdrop-blur-sm border-b border-base-800 flex items-center justify-between px-6 z-10 sticky top-0">
      <div className="flex items-center lg:hidden">
        <button 
          onClick={onMenuClick}
          className="p-2 -ml-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors mr-2"
        >
          <Menu className="w-6 h-6" />
        </button>
        <span className="text-lg font-bold text-white">Global Auto Parts</span>
      </div>
      <div className="hidden lg:block">
        {/* Can put breadcrumbs or current page title here if needed */}
      </div>
      <div className="flex items-center space-x-4 ml-auto">
        {mounted && !API_URL && (
          <span className="text-xs bg-red-900/50 text-red-400 px-3 py-1 rounded-full border border-red-900 hidden sm:inline-block">
            API_URL missing
          </span>
        )}
        <button className="p-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 transition-colors">
          <Bell className="w-5 h-5" />
        </button>
        
        {/* Profile Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button 
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-600 flex items-center justify-center text-white font-bold shadow-lg hover:scale-105 transition-transform cursor-pointer"
          >
            A
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-base-900 border border-base-800 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in duration-200">
              <div className="px-4 py-3 border-b border-base-800">
                <p className="text-sm font-medium text-white">Admin User</p>
                <p className="text-xs text-base-400 truncate">admin@globalautoparts.com</p>
              </div>
              <div className="py-1">
                <button className="flex items-center w-full px-4 py-2 text-sm text-base-300 hover:bg-base-800 hover:text-white transition-colors">
                  <UserIcon className="w-4 h-4 mr-2" />
                  My Profile
                </button>
                <button 
                  onClick={handleLogout}
                  className="flex items-center w-full px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
