import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchProfiles } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import type { Profile } from '@/hooks/useAuth'

interface AdminScopeValue {
  isAdmin: boolean
  /** Selected salesperson to view as, or null for "all salespeople". Admin only. */
  scopeUserId: string | null
  setScopeUserId: (id: string | null) => void
  /** The user_id to pass to data fetchers — undefined unless an admin narrowed to one person. */
  scopeParam: string | undefined
  salespeople: Profile[]
}

const AdminScopeContext = createContext<AdminScopeValue | null>(null)

export function AdminScopeProvider({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth()
  const [scopeUserId, setScopeUserId] = useState<string | null>(null)

  const profiles = useQuery({
    queryKey: ['profiles'],
    queryFn: fetchProfiles,
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
  })

  const salespeople = useMemo(
    () => (profiles.data ?? []).filter((p) => p.role === 'salesperson'),
    [profiles.data],
  )

  const value: AdminScopeValue = {
    isAdmin,
    scopeUserId: isAdmin ? scopeUserId : null,
    setScopeUserId,
    // Non-admins never scope; RLS already limits them to their own rows.
    scopeParam: isAdmin && scopeUserId ? scopeUserId : undefined,
    salespeople,
  }

  return <AdminScopeContext.Provider value={value}>{children}</AdminScopeContext.Provider>
}

export function useAdminScope() {
  const ctx = useContext(AdminScopeContext)
  if (!ctx) throw new Error('useAdminScope must be used inside AdminScopeProvider')
  return ctx
}
