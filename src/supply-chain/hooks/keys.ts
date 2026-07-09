/** Centralised react-query keys for the Supply Chain module. */
export const scvKeys = {
  all: ['scv'] as const,
  pis: () => [...scvKeys.all, 'pis'] as const,
  pi: (id: string) => [...scvKeys.all, 'pi', id] as const,
  deliveryNotes: () => [...scvKeys.all, 'deliveryNotes'] as const,
  invoices: () => [...scvKeys.all, 'invoices'] as const,
  exceptions: () => [...scvKeys.all, 'exceptions'] as const,
  validation: () => [...scvKeys.all, 'validation'] as const,
  audit: () => [...scvKeys.all, 'audit'] as const,
  config: () => [...scvKeys.all, 'config'] as const,
  search: (q: string) => [...scvKeys.all, 'search', q] as const,
};
