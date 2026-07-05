import { Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { cn } from '@/lib/utils'

export interface SheetOption<T extends string> {
  value: T
  label: string
  hint?: string
  icon?: LucideIcon
}

/** iOS-style picker rendered as a bottom sheet — replaces native dropdowns. */
export function OptionSheet<T extends string>({
  open,
  onClose,
  title,
  options,
  value,
  onSelect,
  allowClear,
}: {
  open: boolean
  onClose: () => void
  title: string
  options: SheetOption<T>[]
  value: T | undefined
  onSelect: (value: T | undefined) => void
  allowClear?: string
}) {
  const pick = (next: T | undefined) => {
    onSelect(next)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="overflow-hidden rounded-card bg-surface-2/60">
        {allowClear && (
          <OptionRow
            label={allowClear}
            selected={value === undefined}
            onClick={() => pick(undefined)}
          />
        )}
        {options.map((option) => (
          <OptionRow
            key={option.value}
            label={option.label}
            hint={option.hint}
            icon={option.icon}
            selected={option.value === value}
            onClick={() => pick(option.value)}
          />
        ))}
      </div>
    </Sheet>
  )
}

function OptionRow({
  label,
  hint,
  icon: Icon,
  selected,
  onClick,
}: {
  label: string
  hint?: string
  icon?: LucideIcon
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-separator/60 px-4 py-3.5 text-left last:border-b-0 active:bg-surface-2"
    >
      {Icon && (
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Icon size={17} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[16px]', selected && 'font-semibold')}>
          {label}
        </span>
        {hint && <span className="block truncate text-[13px] text-ink-2">{hint}</span>}
      </span>
      {selected && <Check size={18} className="shrink-0 text-accent" />}
    </button>
  )
}
