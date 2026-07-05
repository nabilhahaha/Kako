import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { LocateFixed } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { toast } from '@/components/ui/toast'
import { useSaveCustomer } from '@/hooks/mutations'
import type { Customer, CustomerInput } from '@/types'

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

const emptyValues: FormValues = {
  name: '',
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
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: emptyValues })

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
    </Sheet>
  )
}
