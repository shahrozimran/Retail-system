'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Handle login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Mock authentication logic
    setTimeout(() => {
      if (username === 'admin' && password === 'admin123') {
        // Set a simple cookie
        document.cookie = "auth_token=true; path=/; max-age=86400; SameSite=Lax";
        router.push('/');
      } else {
        setError('Invalid username or password');
        setIsLoading(false);
      }
    }, 1500);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-base-950 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary-500/10 rounded-full blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>

      <div className="w-full max-w-md p-8 relative z-10">
        {/* Logo Section */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-600 mb-4 shadow-lg shadow-primary-500/20">
            <ShieldCheck className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Global Auto Parts</h1>
          <p className="text-base-400 mt-2">Sign in to manage your retail system</p>
        </div>

        {/* Login Card */}
        <div className="bg-base-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-8 shadow-2xl">
          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm animate-shake">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-base-300 ml-1">Username</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-base-500 group-focus-within:text-primary-500 transition-colors">
                  <User size={18} />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3 bg-base-950/50 border border-white/5 rounded-xl text-white placeholder-base-600 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all"
                  placeholder="admin"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-base-300 ml-1">Password</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-base-500 group-focus-within:text-primary-500 transition-colors">
                  <Lock size={18} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-11 pr-12 py-3 bg-base-950/50 border border-white/5 rounded-xl text-white placeholder-base-600 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-base-500 hover:text-base-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center px-6 py-3 border border-transparent rounded-xl shadow-lg text-base font-semibold text-white bg-gradient-to-r from-primary-600 to-accent-600 hover:from-primary-500 hover:to-accent-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Sign In
                  <ShieldCheck className="ml-2 w-5 h-5 group-hover:scale-110 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <p className="text-xs text-base-500 uppercase tracking-widest font-semibold">
              Secure Access Only
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
