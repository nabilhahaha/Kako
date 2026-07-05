import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

/**
 * Standard page chrome: glass sticky header with centered iOS-style title,
 * optional back button and right-side actions, plus a subtle entry animation.
 */
export function Page({
  title,
  back,
  actions,
  children,
}: {
  title: string
  /** Fallback route when there is no in-app history to go back to. */
  back?: string
  actions?: ReactNode
  children: ReactNode
}) {
  const navigate = useNavigate()

  const goBack = () => {
    if (window.history.state && window.history.state.idx > 0) navigate(-1)
    else navigate(back ?? '/', { replace: true })
  }

  return (
    <div className="min-h-dvh pb-32">
      <header className="glass sticky top-0 z-30 pt-safe">
        <div className="relative mx-auto flex h-[52px] max-w-2xl items-center px-2">
          {back !== undefined && (
            <button
              onClick={goBack}
              aria-label="Back"
              className="press z-10 flex h-10 items-center pl-1 pr-2 text-accent"
            >
              <ChevronLeft size={26} strokeWidth={2.4} />
            </button>
          )}
          <h1 className="pointer-events-none absolute inset-x-14 text-center text-[17px] font-bold leading-[52px]">
            <span className="block truncate">{title}</span>
          </h1>
          <div className="z-10 ml-auto flex items-center gap-1 pr-2">{actions}</div>
        </div>
      </header>
      <motion.main
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.32, 0.72, 0.32, 1] }}
        className="mx-auto max-w-2xl px-4 pt-4"
      >
        {children}
      </motion.main>
    </div>
  )
}

export function HeaderIconButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void
  label: string
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="press flex h-9 w-9 items-center justify-center rounded-full text-accent hover:bg-accent-soft/70"
    >
      {children}
    </button>
  )
}
