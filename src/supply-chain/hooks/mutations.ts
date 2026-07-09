/** Write-side hooks. Each mutation invalidates the affected query keys. */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ValidationConfig } from '../domain/config';
import { dataStore } from '../repositories';
import { recordAudit } from '../services/auditService';
import { updateConfig } from '../services/configService';
import {
  createDeliveryNote,
  createInvoice,
  createPi,
  deleteDeliveryNote,
  deleteInvoice,
  deletePi,
  updatePi,
  type DeliveryNoteInput,
  type InvoiceInput,
  type PiInput,
} from '../services/entryService';
import {
  createException,
  decideException,
  type CreateExceptionInput,
} from '../services/exceptionService';
import { recomputeAllStatuses } from '../services/piService';
import { runValidationAndPersist } from '../services/validationService';
import { scvKeys } from './keys';

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: scvKeys.all });
}

export function useCreatePi() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: PiInput) => createPi(input),
    onSuccess: invalidate,
  });
}

export function useUpdatePi() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (args: { id: string; input: PiInput }) => updatePi(args.id, args.input),
    onSuccess: invalidate,
  });
}

export function useDeletePi() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => deletePi(id), onSuccess: invalidate });
}

export function useCreateDeliveryNote() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: DeliveryNoteInput) => createDeliveryNote(input),
    onSuccess: invalidate,
  });
}

export function useDeleteDeliveryNote() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => deleteDeliveryNote(id),
    onSuccess: invalidate,
  });
}

export function useCreateInvoice() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: InvoiceInput) => createInvoice(input),
    onSuccess: invalidate,
  });
}

export function useDeleteInvoice() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => deleteInvoice(id),
    onSuccess: invalidate,
  });
}

export function useCreateException() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: CreateExceptionInput) => createException(input),
    onSuccess: invalidate,
  });
}

export function useDecideException() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (args: {
      id: string;
      status: 'approved' | 'rejected';
      approvedBy: string;
      note?: string;
    }) => decideException(args.id, args.status, { approvedBy: args.approvedBy, note: args.note }),
    onSuccess: invalidate,
  });
}

export function useUpdateConfig() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (patch: Partial<ValidationConfig>) => updateConfig(patch),
    onSuccess: invalidate,
  });
}

export function useRevalidate() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async () => {
      await runValidationAndPersist();
      await recomputeAllStatuses();
    },
    onSuccess: invalidate,
  });
}

export function useResetData() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async () => {
      await dataStore.resetAll();
      await recordAudit({
        action: 'DATA_RESET',
        entityType: 'System',
        summary: 'All operational data was reset',
      });
    },
    onSuccess: invalidate,
  });
}
