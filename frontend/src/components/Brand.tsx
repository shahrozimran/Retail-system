import { Component } from 'lucide-react';

export default function Brand({ inverse = false }: { inverse?: boolean }) {
  return <div className="flex items-center gap-3 min-w-0">
    <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${inverse ? 'bg-[#ffffff12] text-[#64d1bd] border border-[#ffffff18]' : 'bg-brand-soft text-brand-ink'}`}><Component size={23} strokeWidth={1.8} /></span>
    <div className="min-w-0"><p className={`font-semibold text-[15px] tracking-tight ${inverse ? 'text-white' : 'text-ink'}`}>Global Auto Parts</p><p className={`text-[10px] tracking-[.16em] uppercase mt-0.5 ${inverse ? 'text-[#91adb5]' : 'text-subtle'}`}>Business workspace</p></div>
  </div>;
}
