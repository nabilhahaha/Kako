/**
 * Settings descriptions — an optional, presentational lookup (href → i18n desc
 * key) used by the Settings home grid for the one-line blurb under each card.
 *
 * NOTE: this is NOT a navigation catalog. The single source of truth for the
 * Settings pages, their groups, and their permission gates is the settings
 * section in `navigation.ts`, surfaced via `resolveSettingsNavGroups`. This map
 * only annotates a subset of pages with a friendly description; pages without an
 * entry simply render without one.
 */
export const SETTINGS_DESCRIPTIONS: Record<string, string> = {
  '/settings/branches': 'settingsHome.branchesDesc',
  '/settings/finance': 'settingsHome.financeDesc',
  '/settings/tax-registrations': 'settingsHome.taxRegDesc',
  '/settings/numbering': 'settingsHome.numberingDesc',
  '/settings/users': 'settingsHome.usersDesc',
  '/settings/staff': 'settingsHome.staffDesc',
  '/settings/permissions': 'settingsHome.permissionsDesc',
  '/settings/organization-structure': 'settingsHome.orgStructureDesc',
  '/settings/organization': 'settingsHome.reportingDesc',
  '/settings/regions': 'settingsHome.regionsDesc',
  '/settings/product-structure': 'settingsHome.productStructureDesc',
  '/settings/uom': 'settingsHome.uomDesc',
  '/settings/approval-matrix': 'settingsHome.approvalMatrixDesc',
  '/settings/workflows': 'settingsHome.workflowsDesc',
  '/settings/workflows/templates': 'settingsHome.workflowTemplatesDesc',
  '/settings/integration-hub': 'settingsHome.integrationHubDesc',
  '/settings/import': 'settingsHome.importDesc',
  '/settings/integrations': 'settingsHome.connectionsDesc',
  '/settings/features': 'settingsHome.featuresDesc',
  '/settings/marketplace': 'settingsHome.marketplaceDesc',
};
