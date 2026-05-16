import { useEffect, useState } from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CountdownPillProps {
  expiresAt: string;
  className?: string;
}

function diffMs(expiresAt: string) {
  return new Date(expiresAt).getTime() - Date.now();
}

function format(ms: number) {
  if (ms <= 0) return 'منتهي';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function CountdownPill({ expiresAt, className }: CountdownPillProps) {
  const [ms, setMs] = useState(() => diffMs(expiresAt));

  useEffect(() => {
    setMs(diffMs(expiresAt));
    const t = setInterval(() => setMs(diffMs(expiresAt)), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const expired = ms <= 0;
  const warn = !expired && ms < 60_000;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums',
        expired
          ? 'bg-muted text-muted-foreground'
          : warn
            ? 'bg-destructive/10 text-destructive'
            : 'bg-success/10 text-success',
        className,
      )}
    >
      {expired ? (
        <AlertCircle className="h-3 w-3" />
      ) : (
        <Clock className="h-3 w-3" />
      )}
      {format(ms)}
    </span>
  );
}
