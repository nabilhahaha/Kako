import { useState } from 'react'
import { Navigation } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { cn } from '@/lib/utils'
import { appleMapsDirUrl, googleMapsDirUrl, isIOS, openExternal } from '@/lib/geo'

/**
 * Opens turn-by-turn navigation to a coordinate. On iPhone it offers a choice
 * between Apple Maps and Google Maps; elsewhere it opens Google Maps directly.
 */
export function NavigateButton({
  latitude,
  longitude,
  label = 'Navigate',
  variant = 'solid',
  className,
  onClick,
}: {
  latitude: number
  longitude: number
  label?: string
  variant?: 'solid' | 'soft' | 'chip' | 'icon'
  className?: string
  onClick?: () => void
}) {
  const [chooserOpen, setChooserOpen] = useState(false)

  const go = (target: 'google' | 'apple') => {
    openExternal(
      target === 'apple' ? appleMapsDirUrl(latitude, longitude) : googleMapsDirUrl(latitude, longitude),
    )
    setChooserOpen(false)
  }

  const handle = (event: React.MouseEvent) => {
    event.stopPropagation()
    onClick?.()
    if (isIOS()) setChooserOpen(true)
    else go('google')
  }

  const base = 'press inline-flex items-center justify-center gap-1.5 font-semibold'
  const styles = {
    solid: 'h-11 rounded-2xl bg-accent px-4 text-[15px] text-white shadow-fab',
    soft: 'h-11 rounded-2xl bg-accent-soft px-4 text-[15px] text-accent',
    chip: 'h-9 rounded-full bg-accent-soft px-3.5 text-[13px] text-accent',
    icon: 'h-9 w-9 rounded-full bg-accent-soft text-accent',
  }[variant]

  return (
    <>
      <button type="button" onClick={handle} aria-label={label} className={cn(base, styles, className)}>
        <Navigation size={variant === 'chip' || variant === 'icon' ? 14 : 17} className="fill-current" />
        {variant !== 'icon' && label}
      </button>
      <Sheet open={chooserOpen} onClose={() => setChooserOpen(false)} title="Open in Maps">
        <div className="space-y-2 pt-1">
          <button
            onClick={() => go('apple')}
            className="press flex w-full items-center gap-3 rounded-card bg-surface-2/70 px-4 py-3.5 text-left text-[16px] font-semibold"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ios-blue/15 text-ios-blue">
              <Navigation size={17} className="fill-current" />
            </span>
            Apple Maps
          </button>
          <button
            onClick={() => go('google')}
            className="press flex w-full items-center gap-3 rounded-card bg-surface-2/70 px-4 py-3.5 text-left text-[16px] font-semibold"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ios-green/15 text-ios-green">
              <Navigation size={17} className="fill-current" />
            </span>
            Google Maps
          </button>
        </div>
      </Sheet>
    </>
  )
}
