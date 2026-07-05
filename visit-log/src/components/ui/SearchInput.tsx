import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  autoFocus,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-2xl bg-surface-2 pl-10 pr-9 text-[16px] text-ink placeholder:text-ink-3 outline-none transition-colors focus:bg-surface focus:ring-4 focus:ring-accent/10 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-separator text-ink-2"
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
}
