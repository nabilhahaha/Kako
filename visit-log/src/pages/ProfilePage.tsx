import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Mail, Shield, User } from 'lucide-react'
import { Page } from '@/components/layout/Page'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAuth } from '@/hooks/useAuth'

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-separator/60 py-3.5 last:border-b-0">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold uppercase tracking-wide text-ink-3">{label}</span>
        <span className="block truncate text-[15px] font-semibold">{value}</span>
      </span>
    </div>
  )
}

export function ProfilePage() {
  const navigate = useNavigate()
  const { session, profile, isAdmin, signOut } = useAuth()
  const [confirm, setConfirm] = useState(false)

  const email = profile?.email ?? session?.user.email ?? '—'
  const name = profile?.full_name || email.split('@')[0]
  const roleLabel = isAdmin ? 'Administrator' : 'Salesperson'

  const onSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <Page title="Profile" back="/">
      <div className="space-y-4">
        <div className="flex flex-col items-center pb-1 pt-2 text-center">
          <span className="mb-3 flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-gradient-to-b from-accent-light to-accent text-[30px] font-bold text-white shadow-fab">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <h2 className="text-[22px] font-bold tracking-tight">{name}</h2>
          <span
            className={
              isAdmin
                ? 'mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-accent/12 px-3 py-1 text-[13px] font-bold text-accent'
                : 'mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-ios-blue/12 px-3 py-1 text-[13px] font-bold text-ios-blue'
            }
          >
            <Shield size={13} />
            {roleLabel}
          </span>
        </div>

        <Card>
          <Row icon={<User size={17} />} label="Name" value={name} />
          <Row icon={<Mail size={17} />} label="Email" value={email} />
          <Row icon={<Shield size={17} />} label="Role" value={roleLabel} />
        </Card>

        {isAdmin && (
          <Card>
            <p className="text-[14px] leading-relaxed text-ink-2">
              As an administrator you can view and manage every salesperson&rsquo;s customers,
              visits, photos and reports. Use the <span className="font-semibold text-ink">Viewing</span> filter
              on the Dashboard, Reports, Map and history screens to focus on one salesperson.
            </p>
          </Card>
        )}

        <Card>
          <button
            onClick={() => setConfirm(true)}
            className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-accent/10 py-3 text-[15px] font-bold text-accent"
          >
            <LogOut size={17} />
            Log Out
          </button>
        </Card>

        <p className="pt-1 text-center text-[12px] font-medium text-ink-3">Roshen Visit Log · v1.1.0</p>
      </div>

      <ConfirmDialog
        open={confirm}
        title="Log out?"
        message="You can sign back in with your email and password."
        confirmLabel="Log Out"
        onConfirm={onSignOut}
        onCancel={() => setConfirm(false)}
      />
    </Page>
  )
}
