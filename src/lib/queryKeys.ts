export const qk = {
  dashboard: (userId: string, days: number) => ['dashboard', userId, days] as const,
  customers: (userId: string) => ['customers', userId] as const,
  customer360: (customerId: string) => ['customer360', customerId] as const,
  visits: (userId: string) => ['visits', userId] as const,
  visitReasons: () => ['visit-reasons'] as const,
  products: () => ['products'] as const,

  team: (supervisorId: string) => ['team', supervisorId] as const,
  teamReps: (supervisorId: string) => ['team-reps', supervisorId] as const,
  pendingVisits: (supervisorId: string) =>
    ['pending-visits', supervisorId] as const,
  pendingNearExpiry: (supervisorId: string) =>
    ['pending-near-expiry', supervisorId] as const,
  visitRequests: (supervisorId: string) =>
    ['visit-requests', supervisorId] as const,
  financialRequests: (supervisorId: string) =>
    ['financial-requests', supervisorId] as const,
  liveMap: (supervisorId: string) => ['live-map', supervisorId] as const,
};
