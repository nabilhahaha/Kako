import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';

export type StatTone = 'primary' | 'success' | 'warning' | 'destructive' | 'info';

const TONE_CLS: Record<StatTone, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  info: 'bg-info/10 text-info',
};

/** Shared dashboard metric card used by every vertical's لوحة (overview).
 *  When `href` is set the whole card becomes a link with a hover affordance. */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'primary',
  href,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: StatTone;
  href?: string;
}) {
  const body = (
    <Card className={href ? 'transition-colors hover:border-primary/40' : ''}>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${TONE_CLS[tone]}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="truncate text-xl font-bold tabular-nums" dir="ltr">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
