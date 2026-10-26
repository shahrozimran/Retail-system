import { CircleAlert, RotateCcw } from 'lucide-react';

export default function DataNotice({ onRetry }: { onRetry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-3 p-4 bg-danger-soft border border-danger/20 rounded-xl text-danger text-sm"><CircleAlert size={17} /><span>We couldn’t load this data. Check your connection and try again.</span><button onClick={onRetry} className="ml-auto flex items-center gap-1.5 text-xs font-semibold underline"><RotateCcw size={13} /> Retry</button></div>;
}
