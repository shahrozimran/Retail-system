'use client';

import { useEffect, useState } from 'react';
import { Download, Loader2, Monitor, WifiOff, X } from 'lucide-react';
import { DESKTOP } from '@/lib/desktop';

type UpdateInfo = { status: 'current' | 'available' | 'unpublished'; version?: string; notes?: string };

export default function DesktopToolbar() {
  const [offline, setOffline] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!DESKTOP) return;
    const sync = () => setOffline(!navigator.onLine);
    window.addEventListener('offline', sync);
    window.addEventListener('online', sync);
    window.addEventListener('load', sync);
    return () => { window.removeEventListener('offline', sync); window.removeEventListener('online', sync); window.removeEventListener('load', sync); };
  }, []);

  if (!DESKTOP) return null;

  async function check() {
    setOpen(true); setBusy(true); setMessage(''); setUpdate(null);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      setUpdate(await invoke<UpdateInfo>('check_updates'));
    } catch { setMessage('Updates could not be checked. Check your internet connection and try again.'); }
    finally { setBusy(false); }
  }

  async function install() {
    setBusy(true); setMessage('Downloading and verifying the update. The app will close to finish installation.');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('install_update');
    } catch { setMessage('The update could not be verified or installed. Your existing installation is unchanged.'); setBusy(false); }
  }

  return <>
    <div className="h-9 px-4 border-b border-neutral-800 bg-neutral-950 flex items-center justify-between text-xs text-neutral-400">
      <span className="flex items-center gap-2"><Monitor size={14} /> Global Auto Parts Desktop <span className="text-neutral-600">v{process.env.NEXT_PUBLIC_DESKTOP_VERSION}</span></span>
      <div className="flex items-center gap-4">
        {offline && <span className="text-amber-400 flex items-center gap-1"><WifiOff size={13} /> Offline — reconnect to use your business data</span>}
        <button onClick={check} className="hover:text-white flex items-center gap-1"><Download size={13} /> Check for updates</button>
      </div>
    </div>
    {open && <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-5">
      <div role="dialog" aria-modal="true" aria-labelledby="desktop-update-title" className="bg-neutral-950 border border-neutral-700 rounded-2xl max-w-md w-full p-6 space-y-4">
        <div className="flex justify-between items-center"><h2 id="desktop-update-title" className="font-bold text-white">Desktop updates</h2><button aria-label="Close updates" disabled={busy} onClick={() => setOpen(false)}><X size={18} /></button></div>
        {busy && <p className="flex gap-2 text-neutral-400"><Loader2 className="animate-spin" size={16} /> {message || 'Checking for updates…'}</p>}
        {!busy && message && <p className="text-amber-300 text-sm">{message}</p>}
        {!busy && update?.status === 'current' && <p className="text-neutral-300 text-sm">You have the latest published version.</p>}
        {!busy && update?.status === 'unpublished' && <p className="text-neutral-300 text-sm">No desktop update has been published yet. You can continue using this version.</p>}
        {!busy && update?.status === 'available' && <>
          <p className="text-neutral-300 text-sm">Version {update.version} is available. Save your work before updating.</p>
          {update.notes && <p className="text-sm text-neutral-400 whitespace-pre-wrap max-h-48 overflow-auto">{update.notes}</p>}
          <button onClick={install} className="bg-white text-black rounded-lg py-2 px-4 font-bold">Install verified update</button>
        </>}
      </div>
    </div>}
  </>;
}
