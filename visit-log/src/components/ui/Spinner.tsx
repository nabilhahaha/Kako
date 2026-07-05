import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex justify-center py-12', className)}>
      <Loader2 className="h-6 w-6 animate-spin text-ink-3" />
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-2xl bg-separator/60',
        className,
      )}
    />
  )
}
