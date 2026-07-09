/** Read-side hooks. Each wraps a service call in a react-query query. */
import { useQuery } from '@tanstack/react-query';
import { dataStore } from '../repositories';
import { listAudit } from '../services/auditService';
import { getConfig } from '../services/configService';
import { listExceptions } from '../services/exceptionService';
import { getPiDetail, listPiSummaries } from '../services/piService';
import { globalSearch } from '../services/searchService';
import { listValidationResults } from '../services/validationService';
import { scvKeys } from './keys';

export function usePiSummaries() {
  return useQuery({ queryKey: scvKeys.pis(), queryFn: listPiSummaries });
}

export function usePiDetail(id: string | undefined) {
  return useQuery({
    queryKey: scvKeys.pi(id ?? ''),
    queryFn: () => getPiDetail(id as string),
    enabled: Boolean(id),
  });
}

export function useDeliveryNotes() {
  return useQuery({
    queryKey: scvKeys.deliveryNotes(),
    queryFn: async () => {
      const dns = await dataStore.deliveryNotes.getAll();
      return dns.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  });
}

export function useInvoices() {
  return useQuery({
    queryKey: scvKeys.invoices(),
    queryFn: async () => {
      const invoices = await dataStore.invoices.getAll();
      return invoices.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  });
}

export function useExceptions() {
  return useQuery({ queryKey: scvKeys.exceptions(), queryFn: listExceptions });
}

export function useValidationResults() {
  return useQuery({ queryKey: scvKeys.validation(), queryFn: listValidationResults });
}

export function useAuditLogs() {
  return useQuery({ queryKey: scvKeys.audit(), queryFn: listAudit });
}

export function useConfig() {
  return useQuery({ queryKey: scvKeys.config(), queryFn: getConfig });
}

export function useSearch(query: string) {
  return useQuery({
    queryKey: scvKeys.search(query),
    queryFn: () => globalSearch(query),
    enabled: query.trim().length >= 2,
  });
}
