import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ChevronRight, LocateFixed } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { OptionSheet } from '@/components/ui/OptionSheet'
import { toast } from '@/components/ui/toast'
import { useSaveCustomer } from '@/hooks/mutations'
import { CUSTOMER_CATEGORY_LABELS, DISTRIBUTOR_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import {
  CUSTOMER_CATEGORIES,
  DISTRIBUTORS,
  type Customer,
  type CustomerCategory,
  type CustomerInput,
  type Distributor,
} from '@/types'

const coordinate = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .refine((value) => {
      if (value === '') return true
      const num = parseFloat(value)
      return Number.isFinite(num) && num >= min && num <= max
    }, `Invalid ${label}`)

const schema = z.object({
  name: z.string().trim().min(1, 'Customer name is required'),
  // '' until the user picks — all three are required on create and edit.
  customer_category: z.enum(CUSTOMER_CATEGORIES, {
    errorMap: () => ({ message: 'Customer category is required' }),
  }),
  roshen_available: z.enum(['yes', 'no'], {
    errorMap: () => ({ message: 'Roshen availability is required' }),
  }),
  distributor: z.enum(DISTRIBUTORS, {
    errorMap: () => ({ message: 'Distributor is required' }),
  }),
  code: z.string().trim(),
  city: z.string().trim(),
  area: z.string().trim(),
  address: z.string().trim(),
  phone: z.string().trim(),
  notes: z.string().trim(),
  latitude: coordinate(-90, 90, 'latitude'),
  longitude: coordinate(-180, 180, 'longitude'),
})

type FormValues = z.infer<typeof schema>

const emptyValues = {
  name: '',
  customer_category: '' as CustomerCategory,
  roshen_available: '' as 'yes' | 'no',
  distributor: '' as Distributor,
  code: '',
  city: '',
  area: '',
  address: '',
  phone: '',
  notes: '',
  latitude: '',
  longitude: '',
}

function toFormValues(customer: Customer): FormValues {
  return {
    name: customer.name,
    customer_category: customer.customer_category ?? ('' as CustomerCategory),
    roshen_available: customer.roshen_available ? 'yes' : 'no',
    distributor: customer.distributor ?? ('' as Distributor),
    code: customer.code ?? '',
    city: customer.city ?? '',
    area: customer.area ?? '',
    address: customer.address ?? '',
    phone: customer.phone ?? '',
    notes: customer.notes ?? '',
    latitude: customer.latitude?.toString() ?? '',
    longitude: customer.longitude?.toString() ?? '',
  }
}

const categoryOptions = CUSTOMER_CATEGORIES.map((value) => ({ value, label: CUSTOMER_CATEGORY_LABELS[value] }))
const roshenOptions = [
  { value: 'yes' as const, label: 'Yes' },
  { value: 'no' as const, label: 'No' },
]
const distributorOptions = DISTRIBUTORS.map((value) => ({ value, label: DISTRIBUTOR_LABELS[value] }))

/** A tappable dropdown row that opens an OptionSheet — matches the app style. */
function DropdownField({
  label,
  error,
  value,
  placeholder,
  onOpen,
}: {
  label: string
  error?: string
  value: string | null
  placeholder: string
  onOpen: () => void
}) {
  return (
    <Field label={label} error={error}>
      <button
        type="button"
        onClick={onOpen}
        className="flex h-12 w-full items-center justify-between rounded-2xl bg-surface-2 px-4 text-left text-[16px] transition-colors focus:ring-4 focus:ring-accent/10"
      >
        <span className={cn(value ? 'text-ink' : 'text-ink-3')}>{value ?? placeholder}</span>
        <ChevronRight size={18} className="text-ink-3" />
      </button>
    </Field>
  )
}

export function CustomerForm({
  open,
  onClose,
  customer,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  customer?: Customer
  onSaved?: (customer: Customer) => void
}) {
  const save = useSaveCustomer()
  const [sheet, setSheet] = useState<null | 'category' | 'roshen' | 'distributor'>(null)
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const category = watch('customer_category')
  const roshen = watch('roshen_available')
  const distributor = watch('distributor')

  useEffect(() => {
    if (open) reset(customer ? toFormValues(customer) : emptyValues)
  }, [open, customer, reset])

  const fillLocation = () => {
    if (!('geolocation' in navigator)) {
      toast('Location is not available on this device', 'error')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setValue('latitude', position.coords.latitude.toFixed(6), { shouldValidate: true })
        setValue('longitude', position.coords.longitude.toFixed(6), { shouldValidate: true })
        toast('Location captured')
      },
      () => toast('Could not get your location', 'error'),
      { enableHighAccuracy: true, timeout: 12000 },
    )
  }

  const onSubmit = handleSubmit(async (values) => {
    const input: CustomerInput = {
      name: values.name,
      customer_category: values.customer_category,
      custom_category: null,
      roshen_available: values.roshen_available === 'yes',
      distributor: values.distributor,
      code: values.code || null,
      city: values.city || null,
      area: values.area || null,
      address: values.address || null,
      phone: values.phone || null,
      notes: values.notes || null,
      latitude: values.latitude ? parseFloat(values.latitude) : null,
      longitude: values.longitude ? parseFloat(values.longitude) : null,
    }
    try {
      const saved = await save.mutateAsync({ id: customer?.id, input })
      toast(customer ? 'Customer updated' : 'Customer added')
      onSaved?.(saved)
      onClose()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save customer', 'error')
    }
  })

  return (
    <Sheet open={open} onClose={onClose} title={customer ? 'Edit Customer' : 'New Customer'} tall>
      <form onSubmit={onSubmit} className="space-y-4 pt-1">
        <Field label="Customer Name" error={errors.name?.message}>
          <Input placeholder="ABC Market" autoComplete="off" {...register('name')} />
        </Field>

        <DropdownField
          label="Customer Category"
          error={errors.customer_category?.message}
          value={category ? CUSTOMER_CATEGORY_LABELS[category] : null}
          placeholder="Select category"
          onOpen={() => setSheet('category')}
        />

        <DropdownField
          label="Roshen Available"
          error={errors.roshen_available?.message}
          value={roshen ? (roshen === 'yes' ? 'Yes' : 'No') : null}
          placeholder="Select availability"
          onOpen={() => setSheet('roshen')}
        />

        <DropdownField
          label="Distributor"
          error={errors.distributor?.message}
          value={distributor ? DISTRIBUTOR_LABELS[distributor] : null}
          placeholder="Select distributor"
          onOpen={() => setSheet('distributor')}
        />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Customer Code" optional>
            <Input placeholder="C-001" autoComplete="off" {...register('code')} />
          </Field>
          <Field label="Phone" optional>
            <Input type="tel" placeholder="+380 50 000 0000" {...register('phone')} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City" optional>
            <Input placeholder="Kyiv" {...register('city')} />
          </Field>
          <Field label="Area" optional>
            <Input placeholder="Podil" {...register('area')} />
          </Field>
        </div>
        <Field label="Address" optional>
          <Input placeholder="Street, building" {...register('address')} />
        </Field>
        <div>
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">
              GPS Location <span className="ml-1 font-normal normal-case text-ink-3">optional</span>
            </span>
            <button
              type="button"
              onClick={fillLocation}
              className="press inline-flex items-center gap-1 text-[13px] font-semibold text-accent"
            >
              <LocateFixed size={14} />
              Use current
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input placeholder="Latitude" inputMode="decimal" {...register('latitude')} />
              {errors.latitude && (
                <span className="mt-1 block px-1 text-[13px] font-medium text-accent">
                  {errors.latitude.message}
                </span>
              )}
            </div>
            <div>
              <Input placeholder="Longitude" inputMode="decimal" {...register('longitude')} />
              {errors.longitude && (
                <span className="mt-1 block px-1 text-[13px] font-medium text-accent">
                  {errors.longitude.message}
                </span>
              )}
            </div>
          </div>
        </div>
        <Field label="Notes" optional>
          <Textarea placeholder="Anything worth remembering about this customer…" {...register('notes')} />
        </Field>
        <Button type="submit" size="lg" full loading={save.isPending}>
          {customer ? 'Save Changes' : 'Add Customer'}
        </Button>
      </form>

      <OptionSheet
        open={sheet === 'category'}
        onClose={() => setSheet(null)}
        title="Customer Category"
        options={categoryOptions}
        value={category || undefined}
        onSelect={(next) => next && setValue('customer_category', next, { shouldValidate: true })}
      />
      <OptionSheet
        open={sheet === 'roshen'}
        onClose={() => setSheet(null)}
        title="Roshen Available"
        options={roshenOptions}
        value={roshen || undefined}
        onSelect={(next) => next && setValue('roshen_available', next, { shouldValidate: true })}
      />
      <OptionSheet
        open={sheet === 'distributor'}
        onClose={() => setSheet(null)}
        title="Distributor"
        options={distributorOptions}
        value={distributor || undefined}
        onSelect={(next) => next && setValue('distributor', next, { shouldValidate: true })}
      />
    </Sheet>
  )
}
