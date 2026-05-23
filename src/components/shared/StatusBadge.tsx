import { cn } from '@/lib/utils';

const statusColors: Record<string, string> = {
  Completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  'In Progress': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Missed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'Out of Location': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  Pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  Approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  Active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Inactive: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  Suspended: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', statusColors[status] ?? 'bg-gray-100 text-gray-700', className)}>
      {status}
    </span>
  );
}
