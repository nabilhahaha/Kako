/** Assembles per-module message namespaces into single ar/en catalogs.
 *  Each module file exports `ar` and `en`, each owning unique top-level
 *  namespace key(s), so a shallow merge is conflict-free. Add a module by
 *  importing it and listing it in MODULES. */
import * as core from './core';
import * as shared from './shared';
import * as products from './products';
import * as inventory from './inventory';
import * as sales from './sales';
import * as customers from './customers';
import * as suppliers from './suppliers';
import * as purchases from './purchases';
import * as accounting from './accounting';
import * as clinic from './clinic';
import * as restaurant from './restaurant';
import * as salon from './salon';
import * as pharmacy from './pharmacy';
import * as laundry from './laundry';
import * as hotel from './hotel';
import * as wholesale from './wholesale';
import * as market from './market';
import * as distribution from './distribution';
import * as settings from './settings';
import * as account from './account';
import * as platform from './platform';
import * as rep from './rep';
import * as exportsMod from './exports';
import * as warehouses from './warehouses';
import * as upgrade from './upgrade';
import * as landing from './landing';
import * as marketplace from './marketplace';
import * as organization from './organization';
import * as integrations from './integrations';
import * as entity from './entity';
import * as importMsgs from './import';
import * as dataExport from './data-export';
import * as platformStaff from './platform-staff';
import * as billing from './billing';
import * as customFields from './custom-fields';
import * as workflow from './workflow';
import * as workflows from './workflows';
import * as workflowBuilder from './workflow-builder';
import * as formBuilder from './form-builder';
import * as vanSales from './van-sales';
import * as notifications from './notifications';
import * as electrical from './electrical';
import * as regions from './regions';
import * as customerData from './customer-data';
import * as pricing from './pricing';
import * as attachments from './attachments';
import * as fieldGovernance from './field-governance';
import * as activity from './activity';
import * as analytics from './analytics';
import * as authz from './authz';
import * as fmcg from './fmcg';
import * as fmcgw1 from './fmcgw1';
import * as copilot from './copilot';
import * as attention from './attention';
import * as home from './home';
import * as inthub from './inthub';
import * as routeexec from './routeexec';
import * as salesman from './salesman';
import * as vanops from './vanops';
import * as onboarding from './onboarding';
import * as retail from './retail';
import * as fashion from './fashion';
import * as search from './search';
import * as changeRequests from './change-requests';
import * as alertsUi from './alerts';
import * as entitlementsUi from './entitlements';
import * as actionPolicies from './action-policies';
import * as returnPolicy from './return-policy';
import * as features from './features';
import * as pos from './pos';
import * as pharmacyOps from './pharmacy-ops';
import * as orgStructure from './org-structure';
import * as productStructure from './product-structure';
import * as numbering from './numbering';
import * as financeSetup from './finance-setup';
import * as goLive from './go-live';
import * as approvalMatrix from './approval-matrix';
import * as taxRegistrations from './tax-registrations';
import * as settingsHome from './settings-home';
import * as quickActions from './quick-actions';
import * as accessOverrides from './access-overrides';
import * as roleOverrides from './role-overrides';
import * as adminWb from './admin-workbench';
import * as customer360 from './customer-360';

const MODULES = [
  core, shared, products, inventory, sales, customers, suppliers, purchases,
  accounting, clinic, restaurant, salon, pharmacy, laundry, hotel, wholesale,
  market, distribution, settings, account, platform, rep, exportsMod,
  warehouses, upgrade, landing, marketplace, organization, integrations, entity,
  importMsgs, dataExport, platformStaff, billing, customFields, workflow, workflows, workflowBuilder, formBuilder, vanSales, notifications,
  electrical, regions, customerData, pricing, attachments, fieldGovernance,
  activity, analytics, authz, fmcg, fmcgw1, copilot, attention, home, salesman, routeexec, vanops, inthub,
  onboarding,
  retail,
  fashion,
  search,
  changeRequests,
  alertsUi,
  entitlementsUi,
  actionPolicies,
  returnPolicy,
  features,
  pos,
  pharmacyOps,
  orgStructure,
  productStructure,
  numbering,
  financeSetup,
  goLive,
  approvalMatrix,
  taxRegistrations,
  settingsHome,
  quickActions,
  accessOverrides,
  roleOverrides,
  adminWb,
  customer360,
];

type Catalog = Record<string, unknown>;

function assemble(locale: 'ar' | 'en'): Catalog {
  return Object.assign({}, ...MODULES.map((m) => m[locale]));
}

export const arMessages = assemble('ar');
export const enMessages = assemble('en');
