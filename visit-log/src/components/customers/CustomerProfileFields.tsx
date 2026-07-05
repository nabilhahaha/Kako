import { useEffect, useState } from 'react'
import { Check, ChevronRight, Loader2 } from 'lucide-react'
import { OptionSheet } from '@/components/ui/OptionSheet'
import { Field } from '@/components/ui/Input'
import { toast } from '@/components/ui/toast'
import { useUpdateCustomerProfile } from '@/hooks/mutations'
import { CUSTOMER_CATEGORY_LABELS, DISTRIBUTOR_LABELS } from '@/lib/constants'
import {
  CUSTOMER_CATEGORIES,
  DISTRIBUTORS,
  type Customer,
  type CustomerCategory,
  type Distributor,
} from '@/types'

const categoryOptions = CUSTOMER_CATEGORIES.map((value) => ({ value, label: CUSTOMER_CATEGORY_LABELS[value] }))
const distributorOptions = DISTRIBUTORS.map((value) => ({ value, label: DISTRIBUTOR_LABELS[value] }))
const roshenOptions = [
  { value: 'yes' as const, label: 'Yes' },
  { value: 'no' as const, label: 'No' },
]

function Row({
  label,
  value,
  saving,
  onOpen,
}: {
  label: string
  value: string
  saving: boolean
  onOpen: () => void
}) {
  return (
    <Field label={label}>
      <button
        type="button"
        onClick={onOpen}
        className="flex h-12 w-full items-center justify-between rounded-2xl bg-surface-2 px-4 text-left text-[16px] transition-colors focus:ring-4 focus:ring-accent/10"
      >
        <span className="font-semibold text-ink">{value}</span>
        {saving ? (
          <Loader2 size={16} className="animate-spin text-ink-3" />
        ) : (
          <ChevronRight size={18} className="text-ink-3" />
        )}
      </button>
    </Field>
  )
}

/**
 * The live customer profile (category / Roshen availability / distributor)
 * surfaced inside the New Visit flow. Values are preloaded from the selected
 * customer; changing any of them patches the customer master record directly so
 * future visits, reports and exports use the latest values — nothing is
 * duplicated on the visit itself.
 */
export function CustomerProfileFields({
  customer,
  onUpdated,
}: {
  customer: Customer
  onUpdated?: (customer: Customer) => void
}) {
  const update = useUpdateCustomerProfile()
  const [sheet, setSheet] = useState<null | 'category' | 'roshen' | 'distributor'>(null)
  const [category, setCategory] = useState<CustomerCategory>(customer.customer_category ?? 'other')
  const [roshen, setRoshen] = useState<'yes' | 'no'>(customer.roshen_available ? 'yes' : 'no')
  const [distributor, setDistributor] = useState<Distributor>(customer.distributor ?? 'other')
  const [savingField, setSavingField] = useState<null | 'category' | 'roshen' | 'distributor'>(null)

  // Preload whenever a different customer is selected.
  useEffect(() => {
    setCategory(customer.customer_category ?? 'other')
    setRoshen(customer.roshen_available ? 'yes' : 'no')
    setDistributor(customer.distributor ?? 'other')
  }, [customer.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const persist = async (
    field: 'category' | 'roshen' | 'distributor',
    fields: Partial<Pick<Customer, 'customer_category' | 'roshen_available' | 'distributor'>>,
  ) => {
    setSavingField(field)
    try {
      const saved = await update.mutateAsync({ id: customer.id, fields })
      onUpdated?.(saved)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not update customer', 'error')
    } finally {
      setSavingField(null)
    }
  }

  return (
    <div className="space-y-4 rounded-card bg-surface p-4 shadow-card">
      <Row
        label="Customer Category"
        value={CUSTOMER_CATEGORY_LABELS[category]}
        saving={savingField === 'category'}
        onOpen={() => setSheet('category')}
      />
      <Row
        label="Roshen Available"
        value={roshen === 'yes' ? 'Yes' : 'No'}
        saving={savingField === 'roshen'}
        onOpen={() => setSheet('roshen')}
      />
      <Row
        label="Distributor"
        value={DISTRIBUTOR_LABELS[distributor]}
        saving={savingField === 'distributor'}
        onOpen={() => setSheet('distributor')}
      />
      <p className="flex items-center gap-1.5 px-1 text-[12px] text-ink-3">
        <Check size={13} className="text-ios-green" />
        Changes update this customer&rsquo;s profile for all future visits and reports.
      </p>

      <OptionSheet
        open={sheet === 'category'}
        onClose={() => setSheet(null)}
        title="Customer Category"
        options={categoryOptions}
        value={category}
        onSelect={(next) => {
          if (!next || next === category) return
          setCategory(next)
          persist('category', { customer_category: next })
        }}
      />
      <OptionSheet
        open={sheet === 'roshen'}
        onClose={() => setSheet(null)}
        title="Roshen Available"
        options={roshenOptions}
        value={roshen}
        onSelect={(next) => {
          if (!next || next === roshen) return
          setRoshen(next)
          persist('roshen', { roshen_available: next === 'yes' })
        }}
      />
      <OptionSheet
        open={sheet === 'distributor'}
        onClose={() => setSheet(null)}
        title="Distributor"
        options={distributorOptions}
        value={distributor}
        onSelect={(next) => {
          if (!next || next === distributor) return
          setDistributor(next)
          persist('distributor', { distributor: next })
        }}
      />
    </div>
  )
}
