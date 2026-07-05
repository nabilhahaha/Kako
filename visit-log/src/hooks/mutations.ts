import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createCustomer,
  createVisit,
  deleteCustomer,
  deleteVisit,
  importCustomers,
  updateCustomer,
  updateVisit,
} from '@/lib/api'
import { addPendingVisit } from '@/lib/outbox'
import { isNetworkError } from '@/lib/utils'
import type { CustomerInput, VisitInput, VisitPhoto, VisitWithMeta } from '@/types'

function useInvalidateVisitData() {
  const queryClient = useQueryClient()
  return (visitId?: string) => {
    queryClient.invalidateQueries({ queryKey: ['visits'] })
    queryClient.invalidateQueries({ queryKey: ['stats'] })
    queryClient.invalidateQueries({ queryKey: ['gallery'] })
    if (visitId) queryClient.invalidateQueries({ queryKey: ['visit', visitId] })
  }
}

// ---------------------------------------------------------------- customers

export function useSaveCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CustomerInput }) =>
      id ? updateCustomer(id, input) : createCustomer(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient()
  const invalidateVisits = useInvalidateVisitData()
  return useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      invalidateVisits()
    },
  })
}

export function useImportCustomers() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: importCustomers,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}

// ------------------------------------------------------------------- visits

export type CreateVisitResult = { status: 'saved'; visitId: string } | { status: 'queued' }

export function useCreateVisit() {
  const invalidate = useInvalidateVisitData()
  return useMutation({
    mutationFn: async ({
      input,
      photos,
    }: {
      input: VisitInput
      photos: Blob[]
    }): Promise<CreateVisitResult> => {
      try {
        const visit = await createVisit(input, photos)
        return { status: 'saved', visitId: visit.id }
      } catch (error) {
        if (isNetworkError(error)) {
          await addPendingVisit({
            ...input,
            localId: crypto.randomUUID(),
            photos,
            queued_at: new Date().toISOString(),
          })
          return { status: 'queued' }
        }
        throw error
      }
    },
    onSuccess: () => invalidate(),
  })
}

export function useUpdateVisit() {
  const invalidate = useInvalidateVisitData()
  return useMutation({
    mutationFn: ({
      id,
      input,
      newPhotos,
      removedPhotos,
      keptCount,
    }: {
      id: string
      input: VisitInput
      newPhotos: Blob[]
      removedPhotos: VisitPhoto[]
      keptCount: number
    }) => updateVisit(id, input, { newPhotos, removedPhotos, keptCount }),
    onSuccess: (_data, variables) => invalidate(variables.id),
  })
}

export function useDeleteVisit() {
  const invalidate = useInvalidateVisitData()
  return useMutation({
    mutationFn: (visit: VisitWithMeta) => deleteVisit(visit),
    onSuccess: (_data, visit) => invalidate(visit.id),
  })
}
