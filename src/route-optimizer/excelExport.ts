import * as XLSX from 'xlsx';
import type {
  OptimizationResult,
  Customer,
  Depot,
  RouteResult,
} from './types';

const GOOGLE_MAPS_MAX_WAYPOINTS = 25;

/**
 * Generates a Google Maps directions URL with waypoints for a sequence of stops.
 * Google Maps supports up to 25 waypoints in a directions URL.
 * Format: https://www.google.com/maps/dir/lat1,lng1/lat2,lng2/...
 */
export function generateGoogleMapsUrl(
  depot: Depot | null,
  customers: Customer[]
): string {
  const points: string[] = [];

  if (depot) {
    points.push(`${depot.lat},${depot.lng}`);
  }

  const limit = depot
    ? GOOGLE_MAPS_MAX_WAYPOINTS - 1
    : GOOGLE_MAPS_MAX_WAYPOINTS;

  for (let i = 0; i < Math.min(customers.length, limit); i++) {
    points.push(`${customers[i].lat},${customers[i].lng}`);
  }

  if (points.length === 0) {
    return '';
  }

  return `https://www.google.com/maps/dir/${points.join('/')}`;
}

/**
 * Auto-sizes worksheet columns based on content width.
 */
function autoSizeColumns(ws: XLSX.WorkSheet, data: unknown[][]): void {
  if (data.length === 0) return;

  const colWidths: number[] = [];
  for (const row of data) {
    for (let c = 0; c < row.length; c++) {
      const cellValue = row[c] != null ? String(row[c]) : '';
      const len = cellValue.length;
      if (colWidths[c] === undefined || len > colWidths[c]) {
        colWidths[c] = len;
      }
    }
  }

  ws['!cols'] = colWidths.map((w) => ({ wch: Math.min(w + 2, 50) }));
}

/**
 * Applies bold styling to the header row of a worksheet.
 */
function applyBoldHeaders(ws: XLSX.WorkSheet, columnCount: number): void {
  for (let c = 0; c < columnCount; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[cellRef]) {
      ws[cellRef].s = {
        font: { bold: true },
      };
    }
  }
}

/**
 * Resolves the customer display name based on language preference.
 * Falls back to English name if Arabic name is not available.
 */
function getCustomerName(customer: Customer, language: string): string {
  if (language === 'ar' && customer.customerNameA) {
    return customer.customerNameA;
  }
  return customer.customerNameE;
}

/**
 * Builds the Weekly_Visit_Plan sheet data.
 * Each row represents one customer visit on a specific day within a route.
 */
function buildWeeklyVisitPlan(
  routes: RouteResult[],
  language: string
): unknown[][] {
  const headers = [
    'Route',
    'Route Type',
    'Day',
    'Sequence',
    'Customer Code',
    'Customer Name',
    'City',
    'Frequency',
    'Latitude',
    'Longitude',
  ];

  const rows: unknown[][] = [headers];

  for (const route of routes) {
    for (const dayPlan of route.dailyPlans) {
      for (let seq = 0; seq < dayPlan.sequencedCustomers.length; seq++) {
        const customer = dayPlan.sequencedCustomers[seq];
        rows.push([
          route.routeIndex + 1,
          route.routeType,
          dayPlan.dayName,
          seq + 1,
          customer.customerNo,
          getCustomerName(customer, language),
          customer.city,
          customer.weeklyFreq,
          customer.lat,
          customer.lng,
        ]);
      }
    }
  }

  return rows;
}

/**
 * Builds the Route_Summary sheet data.
 * One row per route with aggregate metrics.
 */
function buildRouteSummary(routes: RouteResult[]): unknown[][] {
  const headers = [
    'Route',
    'Type',
    'Total Customers',
    'Weekly KM',
    'Monthly KM',
    'Avg Daily Hours',
    'Selling Time %',
    'Warnings',
  ];

  const rows: unknown[][] = [headers];

  for (const route of routes) {
    rows.push([
      route.routeIndex + 1,
      route.routeType,
      route.totalCustomers,
      Math.round(route.weeklyKm * 10) / 10,
      Math.round(route.monthlyKm * 10) / 10,
      Math.round(route.avgDailyHours * 100) / 100,
      Math.round(route.sellingTimeRatio * 1000) / 10,
      route.warnings.join('; '),
    ]);
  }

  return rows;
}

/**
 * Builds the Needs_Decision sheet data.
 * Lists customers that require manual review before assignment.
 */
function buildNeedsDecision(
  customers: Customer[],
  language: string
): unknown[][] {
  const headers = [
    'Customer Code',
    'Customer Name',
    'City',
    'Latitude',
    'Longitude',
    'Reason',
  ];

  const rows: unknown[][] = [headers];

  for (const customer of customers) {
    rows.push([
      customer.customerNo,
      getCustomerName(customer, language),
      customer.city,
      customer.lat,
      customer.lng,
      'Requires manual decision',
    ]);
  }

  return rows;
}

/**
 * Builds the Unassigned_Customers sheet data.
 * Lists customers that could not be assigned to any route.
 */
function buildUnassignedCustomers(
  customers: Customer[],
  language: string
): unknown[][] {
  const headers = [
    'Customer Code',
    'Customer Name',
    'City',
    'Latitude',
    'Longitude',
  ];

  const rows: unknown[][] = [headers];

  for (const customer of customers) {
    rows.push([
      customer.customerNo,
      getCustomerName(customer, language),
      customer.city,
      customer.lat,
      customer.lng,
    ]);
  }

  return rows;
}

/**
 * Creates a worksheet from 2D array data with auto-sized columns and bold headers.
 */
function createSheet(data: unknown[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(data);
  autoSizeColumns(ws, data);
  if (data.length > 0) {
    applyBoldHeaders(ws, data[0].length);
  }
  return ws;
}

/**
 * Exports the optimization result to an Excel file with 4 sheets:
 * - Weekly_Visit_Plan: detailed day-by-day visit schedule
 * - Route_Summary: aggregate route metrics
 * - Needs_Decision: customers requiring manual review
 * - Unassigned_Customers: customers not assigned to any route
 *
 * Triggers a browser download of "JPFOOD_Route_Plan.xlsx".
 */
export function exportToExcel(
  result: OptimizationResult,
  _customers: Customer[],
  language: string
): void {
  const wb = XLSX.utils.book_new();

  // Combine normal and outstation routes for the visit plan and summary
  const allRoutes = [...result.routes, ...result.outstationRoutes];

  // Sheet 1: Weekly_Visit_Plan
  const visitPlanData = buildWeeklyVisitPlan(allRoutes, language);
  const visitPlanSheet = createSheet(visitPlanData);
  XLSX.utils.book_append_sheet(wb, visitPlanSheet, 'Weekly_Visit_Plan');

  // Sheet 2: Route_Summary
  const summaryData = buildRouteSummary(allRoutes);
  const summarySheet = createSheet(summaryData);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Route_Summary');

  // Sheet 3: Needs_Decision
  const needsDecisionData = buildNeedsDecision(
    result.needsDecision,
    language
  );
  const needsDecisionSheet = createSheet(needsDecisionData);
  XLSX.utils.book_append_sheet(wb, needsDecisionSheet, 'Needs_Decision');

  // Sheet 4: Unassigned_Customers
  const unassignedData = buildUnassignedCustomers(
    result.unassignedCustomers,
    language
  );
  const unassignedSheet = createSheet(unassignedData);
  XLSX.utils.book_append_sheet(wb, unassignedSheet, 'Unassigned_Customers');

  // Trigger download
  XLSX.writeFile(wb, 'JPFOOD_Route_Plan.xlsx');
}
