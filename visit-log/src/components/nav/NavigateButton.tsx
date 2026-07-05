import { cn } from '@/lib/utils'
import { googleMapsDirUrl, openExternal } from '@/lib/geo'

/** Google Maps location pin (brand-style, simplified) for the Navigate button. */
function GoogleMapsPin({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2c-3.9 0-7 3.1-7 7 0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z"
      />
      <circle cx="12" cy="9" r="2.6" fill="#fff" />
    </svg>
  )
}

/**
 * Opens turn-by-turn Google Maps navigation to a coordinate. The universal
 * `maps/dir` link launches the Google Maps app when installed (iPhone/Android)
 * and falls back to Google Maps in the browser. Styled as a prominent blue
 * button per product spec.
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
  const go = (event: React.MouseEvent) => {
    event.stopPropagation()
    onClick?.()
    openExternal(googleMapsDirUrl(latitude, longitude))
  }

  const base = 'press inline-flex items-center justify-center gap-1.5 font-semibold'
  const styles = {
    solid: 'h-11 rounded-2xl bg-ios-blue px-4 text-[15px] text-white shadow-[0_6px_16px_-4px_rgba(0,122,255,0.5)]',
    soft: 'h-11 rounded-2xl bg-ios-blue/12 px-4 text-[15px] text-ios-blue',
    chip: 'h-9 rounded-full bg-ios-blue px-3.5 text-[13px] text-white shadow-[0_4px_12px_-4px_rgba(0,122,255,0.5)]',
    icon: 'h-9 w-9 rounded-full bg-ios-blue text-white shadow-[0_4px_12px_-4px_rgba(0,122,255,0.5)]',
  }[variant]
  const iconSize = variant === 'chip' || variant === 'icon' ? 15 : 17

  return (
    <button type="button" onClick={go} aria-label={label} className={cn(base, styles, className)}>
      <GoogleMapsPin size={iconSize} />
      {variant !== 'icon' && label}
    </button>
  )
}
