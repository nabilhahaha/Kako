import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const fieldClasses =
  'w-full rounded-2xl border border-transparent bg-surface-2 px-4 text-[16px] text-ink placeholder:text-ink-3 outline-none transition-colors focus:border-accent/50 focus:bg-surface focus:ring-4 focus:ring-accent/10'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldClasses, 'h-12', className)} {...props} />
  },
)

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(fieldClasses, 'min-h-[120px] py-3', className)} {...props} />
})

export function Field({
  label,
  error,
  optional,
  children,
}: {
  label: string
  error?: string
  optional?: boolean
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-2 px-1">
        <span className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">
          {label}
        </span>
        {optional && <span className="text-xs text-ink-3">optional</span>}
      </span>
      {children}
      {error && <span className="mt-1 block px-1 text-[13px] font-medium text-accent">{error}</span>}
    </label>
  )
}
