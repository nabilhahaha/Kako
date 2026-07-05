import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'plain'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  full?: boolean
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-accent text-white shadow-fab hover:bg-accent-dark disabled:shadow-none',
  secondary: 'bg-accent-soft text-accent hover:bg-accent/15',
  ghost: 'bg-surface-2 text-ink hover:bg-separator/70',
  destructive: 'bg-accent/10 text-accent hover:bg-accent/15',
  plain: 'bg-transparent text-accent hover:bg-accent-soft/60',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm rounded-xl gap-1.5',
  md: 'h-11 px-5 text-[15px] rounded-2xl gap-2',
  lg: 'h-[52px] px-6 text-[17px] rounded-2xl gap-2',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, full, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'press inline-flex select-none items-center justify-center font-semibold outline-none transition-colors disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        full && 'w-full',
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
})
