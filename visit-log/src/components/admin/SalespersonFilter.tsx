import { Users } from 'lucide-react'
import { useAdminScope } from '@/hooks/useAdminScope'
import { cn } from '@/lib/utils'

function displayName(p: { full_name: string | null; email: string | null }) {
  return p.full_name || p.email?.split('@')[0] || 'Salesperson'
}

/**
 * Admin-only "view as salesperson" filter. Sets a global scope so every
 * data surface (Dashboard, Reports, Timeline, Map, History, Search, Next
 * Customer) shows the selected salesperson's data — or all of them. Renders
 * nothing for normal users, whose access is already limited by RLS.
 */
export function SalespersonFilter({ className }: { className?: string }) {
  const { isAdmin, salespeople, scopeUserId, setScopeUserId } = useAdminScope()
  if (!isAdmin) return null

  const chips = [{ id: null as string | null, label: 'All Salespeople' }].concat(
    salespeople.map((p) => ({ id: p.id, label: displayName(p) })),
  )

  return (
    <div className={cn('mb-4', className)}>
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[12px] font-bold uppercase tracking-wide text-ink-3">
        <Users size={13} />
        Viewing
      </div>
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5">
        {chips.map((chip) => {
          const active = scopeUserId === chip.id
          return (
            <button
              key={chip.id ?? 'all'}
              onClick={() => setScopeUserId(chip.id)}
              className={cn(
                'press shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                active ? 'bg-accent text-white shadow-card' : 'bg-surface-2 text-ink-2',
              )}
            >
              {chip.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
