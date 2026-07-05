import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MapPin } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'

export function LoginPage() {
  const { session, loading, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) return <Navigate to="/" replace />

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const result = await signIn(email.trim(), password)
    setSubmitting(false)
    if (result.error) setError(result.error)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 24, stiffness: 240 }}
        className="w-full max-w-sm"
      >
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-5 flex h-[88px] w-[88px] items-center justify-center rounded-[1.9rem] bg-gradient-to-b from-accent-light to-accent-dark shadow-fab">
            <MapPin className="h-11 w-11 text-white" strokeWidth={1.9} />
          </div>
          <h1 className="text-[28px] font-bold tracking-tight">Roshen Visit Log</h1>
          <p className="mt-1 text-[15px] text-ink-2">Your personal visit diary</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </Field>
          {error && (
            <p className="rounded-2xl bg-accent-soft px-4 py-3 text-[14px] font-medium text-accent">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" full loading={submitting}>
            Sign In
          </Button>
        </form>
      </motion.div>
    </div>
  )
}
