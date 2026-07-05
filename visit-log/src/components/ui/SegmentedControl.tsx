import { useId } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn('flex rounded-2xl bg-surface-2 p-1', className)}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className="relative flex-1 rounded-xl px-2 py-2 text-[13px] font-semibold"
          >
            {active && (
              <motion.span
                layoutId={`segment-thumb-${id}`}
                className="absolute inset-0 rounded-xl bg-surface shadow-card"
                transition={{ type: 'spring', damping: 30, stiffness: 400 }}
              />
            )}
            <span className={cn('relative z-10', active ? 'text-ink' : 'text-ink-2')}>
              {option.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
