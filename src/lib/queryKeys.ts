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

  regional: (region: string | null) => ['regional', region ?? 'all'] as const,
  channelStats: () => ['channel-stats'] as const,
  nearExpiryAnalytics: () => ['near-expiry-analytics'] as const,
  promotions: () => ['promotions'] as const,
  regionalApprovals: () => ['regional-approvals'] as const,
  coverageMap: (region: string | null) =>
    ['coverage-map', region ?? 'all'] as const,

  // Dynamic Forms
  dynamicFields: (formKey: string) => ['dynamic-fields', formKey] as const,
  formResponses: (formKey: string, entityId: string) => ['form-responses', formKey, entityId] as const,

  // Competitor Tracking
  competitorReports: (visitId: string) => ['competitor-reports', visitId] as const,

  // Action Plans
  actionPlans: (filters?: string) => ['action-plans', filters ?? 'all'] as const,
  customerActions: (customerId: string) => ['customer-actions', customerId] as const,

  // Visit Product Checks
  productChecks: (visitId: string) => ['product-checks', visitId] as const,

  // Visit Issues
  visitIssues: (visitId: string) => ['visit-issues', visitId] as const,

  // Sync
  syncLogs: (userId: string) => ['sync-logs', userId] as const,

  // Customer Upload
  customerUploadHistory: () => ['customer-upload-history'] as const,
};
