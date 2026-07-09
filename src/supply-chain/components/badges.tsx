/**
 * Status and severity chips. Severity chips implement the mandated colour
 * standard: Green=pass, Yellow=warning, Orange=exception, Red=fail.
 */
import { cn } from '@/lib/utils';
import {
  EXCEPTION_STATUS_LABELS,
  PI_STATUS_LABELS,
  SEVERITY_LABELS,
  type ExceptionStatus,
  type PiStatus,
  type Severity,
} from '../domain/enums';

const chip =
  'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap';

const SEVERITY_STYLES: Record<Severity, string> = {
  pass: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  exception: 'border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400',
  fail: 'border-destructive/30 bg-destructive/10 text-destructive',
};

const SEVERITY_DOT: Record<Severity, string> = {
  pass: 'bg-success',
  warning: 'bg-warning',
  exception: 'bg-orange-500',
  fail: 'bg-destructive',
};

export function SeverityBadge({
  severity,
  className,
  label,
}: {
  severity: Severity;
  className?: string;
  label?: string;
}) {
  return (
    <span className={cn(chip, SEVERITY_STYLES[severity], className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', SEVERITY_DOT[severity])} />
      {label ?? SEVERITY_LABELS[severity]}
    </span>
  );
}

const PI_STATUS_STYLES: Record<PiStatus, string> = {
  OPEN: 'border-border bg-muted text-muted-foreground',
  PARTIALLY_DELIVERED: 'border-info/30 bg-info/10 text-info',
  WAITING_INVOICE: 'border-warning/30 bg-warning/10 text-warning',
  COMPLETED: 'border-success/30 bg-success/10 text-success',
  COMPLETED_WITH_EXCEPTION:
    'border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400',
};

export function PiStatusBadge({ status, className }: { status: PiStatus; className?: string }) {
  return <span className={cn(chip, PI_STATUS_STYLES[status], className)}>{PI_STATUS_LABELS[status]}</span>;
}

const EXCEPTION_STATUS_STYLES: Record<ExceptionStatus, string> = {
  pending: 'border-warning/30 bg-warning/10 text-warning',
  approved: 'border-success/30 bg-success/10 text-success',
  rejected: 'border-destructive/30 bg-destructive/10 text-destructive',
};

export function ExceptionStatusBadge({
  status,
  className,
}: {
  status: ExceptionStatus;
  className?: string;
}) {
  return (
    <span className={cn(chip, EXCEPTION_STATUS_STYLES[status], className)}>
      {EXCEPTION_STATUS_LABELS[status]}
    </span>
  );
}
