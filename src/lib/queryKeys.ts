export const qk = {
  dashboard: (userId: string, days: number) => ['dashboard', userId, days] as const,
  customers: (userId: string) => ['customers', userId] as const,
  customer360: (customerId: string) => ['customer360', customerId] as const,
  visits: (userId: string) => ['visits', userId] as const,
  visitReasons: () => ['visit-reasons'] as const,
  products: () => ['products'] as const,
};
