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
import { CUSTOMER_CATEGORY_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { CUSTOMER_CATEGORIES, type Customer, type CustomerCategory, type CustomerInput } from '@/types'

const coordinate = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .refine((value) => {
      if (value === '') return true
      const num = parseFloat(value)
      return Number.isFinite(num) && num >= min && num <= max
    }, `Invalid ${label}`)

const schema = z
  .object({
    name: z.string().trim().min(1, 'Customer name is required'),
    code: z.string().trim(),
    city: z.string().trim(),
    area: z.string().trim(),
    address: z.string().trim(),
    phone: z.string().trim(),
    notes: z.string().trim(),
    latitude: coordinate(-90, 90, 'latitude'),
    longitude: coordinate(-180, 180, 'longitude'),
    // '' until the user picks — required on both create and edit.
    customer_category: z.enum(CUSTOMER_CATEGORIES, {
      errorMap: () => ({ message: 'Customer category is required' }),
    }),
    custom_category: z.string().trim(),
  })
  .refine((v) => v.customer_category !== 'other' || v.custom_category.length > 0, {
    message: 'Please specify the category',
    path: ['custom_category'],
  })

type FormValues = z.infer<typeof schema>

const emptyValues = {
  name: '',
  code: '',
  city: '',
  area: '',
  address: '',
  phone: '',
  notes: '',
  latitude: '',
  longitude: '',
  customer_category: '' as CustomerCategory,
  custom_category: '',
}

function toFormValues(customer: Customer) {
  return {
    name: customer.name,
    code: customer.code ?? '',
    city: customer.city ?? '',
    area: customer.area ?? '',
    address: customer.address ?? '',
    phone: customer.phone ?? '',
    notes: customer.notes ?? '',
    latitude: customer.latitude?.toString() ?? '',
    longitude: customer.longitude?.toString() ?? '',
    customer_category: customer.customer_category,
    custom_category: customer.custom_category ?? '',
  }
}

const categoryOptions = CUSTOMER_CATEGORIES.map((value) => ({
  value,
  label: CUSTOMER_CATEGORY_LABELS[value],
}))

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
  const [categoryOpen, setCategoryOpen] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  const category = watch('customer_category')

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
      code: values.code || null,
      city: values.city || null,
      area: values.area || null,
      address: values.address || null,
      phone: values.phone || null,
      notes: values.notes || null,
      latitude: values.latitude ? parseFloat(values.latitude) : null,
      longitude: values.longitude ? parseFloat(values.longitude) : null,
      customer_category: values.customer_category,
      custom_category: values.customer_category === 'other' ? values.custom_category : null,
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
    <Sheet open={open} onClose={onClose} title={customer ? 'Edit Customer' : 'New Customer'}>
      <form onSubmit={onSubmit} className="space-y-4 pt-1">
        <Field label="Customer Name" error={errors.name?.message}>
          <Input placeholder="ABC Market" autoComplete="off" {...register('name')} />
        </Field>

        <Field label="Customer Category" error={errors.customer_category?.message}>
          <button
            type="button"
            onClick={() => setCategoryOpen(true)}
            className="flex h-12 w-full items-center justify-between rounded-2xl bg-surface-2 px-4 text-left text-[16px] transition-colors focus:ring-4 focus:ring-accent/10"
          >
            <span className={cn(category ? 'text-ink' : 'text-ink-3')}>
              {category ? CUSTOMER_CATEGORY_LABELS[category] : 'Select category'}
            </span>
            <ChevronRight size={18} className="text-ink-3" />
          </button>
        </Field>
        {category === 'other' && (
          <Field label="Specify Category" error={errors.custom_category?.message}>
            <Input placeholder="e.g. Cafeteria" autoComplete="off" {...register('custom_category')} />
          </Field>
        )}

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
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        title="Customer Category"
        options={categoryOptions}
        value={category || undefined}
        onSelect={(next) => {
          if (!next) return
          setValue('customer_category', next, { shouldValidate: true })
          if (next !== 'other') setValue('custom_category', '', { shouldValidate: true })
        }}
      />
    </Sheet>
  )
}
