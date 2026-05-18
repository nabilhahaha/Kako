import { useEffect, useState } from 'react';
import { useLang, useToast } from '../App.jsx';

const formatRel = (date, tr) => {
  if (!date) return '';
  const diffSec = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diffSec < 5) return tr.justNow;
  if (diffSec < 60) return tr.secondsAgo.replace('{n}', diffSec);
  const m = Math.floor(diffSec / 60);
  if (m < 60) return tr.minutesAgo.replace('{n}', m);
  const h = Math.floor(m / 60);
  return tr.hoursAgo.replace('{n}', h);
};

// Compact icon-button + relative timestamp. Pair with useRefresh() or pass
// your own callback (the button will manage success / error visual states).
export default function RefreshButton({
  onRefresh,
  lastRefreshedAt,
  isRefreshing: extIsRefreshing,
  compact = false,
}) {
  const { tr } = useLang();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errored, setErrored] = useState(false);
  const [, force] = useState(0);

  // Re-render every 30s so the relative timestamp stays fresh.
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const isRefreshing = extIsRefreshing ?? busy;

  const handleClick = async () => {
    if (isRefreshing) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      toast(tr.offline, 'error');
      return;
    }
    setSuccess(false);
    setErrored(false);
    setBusy(true);
    try {
      await onRefresh();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 1000);
    } catch (e) {
      console.error('[RefreshButton] refresh failed', e);
      setErrored(true);
      toast(
        `${tr.refreshFailed}${e?.message ? ': ' + e.message : ''}`,
        'error',
      );
      setTimeout(() => setErrored(false), 2000);
    } finally {
      setBusy(false);
    }
  };

  const icon = success ? '✓' : errored ? '!' : '🔄';
  const stateCls = errored
    ? 'text-red-700 bg-red-50 border-red-200'
    : success
    ? 'text-green-700 bg-green-50 border-green-200'
    : 'text-gray-700 bg-white border-gray-200 hover:bg-gray-50';

  return (
    <div className="inline-flex items-center gap-2 whitespace-nowrap">
      {!compact && lastRefreshedAt && (
        <span className="hidden sm:inline text-[10px] text-gray-500">
          {tr.lastUpdated}: {formatRel(lastRefreshedAt, tr)}
        </span>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={isRefreshing}
        className={`rounded-full w-11 h-11 flex items-center justify-center border transition active:scale-[0.95] disabled:opacity-50 ${stateCls}`}
        title={isRefreshing ? tr.refreshing : tr.refresh}
        aria-label={tr.refresh}
      >
        <span className={isRefreshing ? 'inline-block animate-spin' : ''} aria-hidden>
          {icon}
        </span>
      </button>
    </div>
  );
}
