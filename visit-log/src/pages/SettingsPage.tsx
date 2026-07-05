import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileDown,
  FileSpreadsheet,
  Loader2,
  LogOut,
  Moon,
  type LucideIcon,
} from 'lucide-react'
import { Page } from '@/components/layout/Page'
import { Card } from '@/components/ui/Card'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { toast } from '@/components/ui/toast'
import { useAuth } from '@/hooks/useAuth'
import { useTheme, type ThemePreference } from '@/hooks/useTheme'
import { useCustomers } from '@/hooks/queries'
import { fetchAllVisits } from '@/lib/api'

const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

function ExportRow({
  label,
  hint,
  icon: Icon,
  busy,
  onClick,
}: {
  label: string
  hint: string
  icon: LucideIcon
  busy: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex w-full items-center gap-3 border-b border-separator/60 px-1 py-3 text-left last:border-b-0 active:bg-surface-2 disabled:opacity-50"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
      </span>
      <span className="flex-1">
        <span className="block text-[15px] font-semibold">{label}</span>
        <span className="block text-[13px] text-ink-2">{hint}</span>
      </span>
    </button>
  )
}

export function SettingsPage() {
  const navigate = useNavigate()
  const { session, signOut } = useAuth()
  const { preference, setPreference } = useTheme()
  const customers = useCustomers()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  const exportVisits = async (kind: 'excel' | 'csv') => {
    setBusy(`visits-${kind}`)
    try {
      const [visits, exporters] = await Promise.all([fetchAllVisits(), import('@/lib/export')])
      if (kind === 'excel') exporters.exportVisitsExcel(visits, 'all-visits')
      else exporters.exportVisitsCsv(visits, 'all-visits')
      toast('Export ready')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Export failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  const exportCustomerList = async (kind: 'excel' | 'csv') => {
    const list = customers.data ?? []
    if (list.length === 0) {
      toast('No customers to export', 'info')
      return
    }
    setBusy(`customers-${kind}`)
    try {
      const exporters = await import('@/lib/export')
      if (kind === 'excel') exporters.exportCustomersExcel(list)
      else exporters.exportCustomersCsv(list)
      toast('Export ready')
    } finally {
      setBusy(null)
    }
  }

  const onSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <Page title="Settings" back="/">
      <div className="space-y-4">
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Moon size={16} className="text-ink-2" />
            <h3 className="text-[15px] font-bold">Appearance</h3>
          </div>
          <SegmentedControl options={themeOptions} value={preference} onChange={setPreference} />
        </Card>

        <Card>
          <h3 className="mb-1 px-1 text-[15px] font-bold">Export Data</h3>
          <ExportRow
            label="All Visits — Excel"
            hint="Every visit with customer, type, status and notes"
            icon={FileSpreadsheet}
            busy={busy === 'visits-excel'}
            onClick={() => exportVisits('excel')}
          />
          <ExportRow
            label="All Visits — CSV"
            hint="Plain CSV for any tool"
            icon={FileDown}
            busy={busy === 'visits-csv'}
            onClick={() => exportVisits('csv')}
          />
          <ExportRow
            label="Customers — Excel"
            hint="Full customer database"
            icon={FileSpreadsheet}
            busy={busy === 'customers-excel'}
            onClick={() => exportCustomerList('excel')}
          />
          <ExportRow
            label="Customers — CSV"
            hint="Full customer database"
            icon={FileDown}
            busy={busy === 'customers-csv'}
            onClick={() => exportCustomerList('csv')}
          />
        </Card>

        <Card>
          <h3 className="mb-2 px-1 text-[15px] font-bold">Account</h3>
          <p className="px-1 pb-3 text-[14px] text-ink-2">{session?.user.email}</p>
          <button
            onClick={() => setConfirmSignOut(true)}
            className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-accent/10 py-3 text-[15px] font-bold text-accent"
          >
            <LogOut size={17} />
            Sign Out
          </button>
        </Card>

        <p className="pt-2 text-center text-[12px] font-medium text-ink-3">
          Roshen Visit Log · v1.0.0
          <br />
          Install from your browser&rsquo;s share menu for the full app experience.
        </p>
      </div>

      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out?"
        message="You can sign back in with your email and password."
        confirmLabel="Sign Out"
        onConfirm={onSignOut}
        onCancel={() => setConfirmSignOut(false)}
      />
    </Page>
  )
}
