import { useState, useMemo } from 'react';
import type { SalesDataset } from '@/lib/salesTypes';
import { stringToDayIndex, dayIndexToString, formatSAR, formatNumber } from '@/lib/salesDataUtils';

interface Props {
  dataset: SalesDataset;
  indices: Uint32Array;
}

type AlertSeverity = 'critical' | 'warning' | 'info';

interface Alert {
  id: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  action: string;
  details: Record<string, string | number>;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
const SEVERITY_ICON: Record<AlertSeverity, string> = { critical: '🔴', warning: '🟡', info: '🔵' };

function detectDeclingSalesmen(ds: SalesDataset, indices: Uint32Array, refDay: number): Alert[] {
  const { data, salesmen } = ds;
  const curFrom = refDay - 29;
  const prevFrom = curFrom - 30;
  const prevTo = curFrom - 1;

  const curSales = new Float64Array(salesmen.length);
  const prevSales = new Float64Array(salesmen.length);

  for (const i of indices) {
    if (data.r[i] === 1) continue;
    const d = data.d[i];
    const sm = data.sm[i];
    if (d >= curFrom && d <= refDay) {
      curSales[sm] += data.s[i];
    } else if (d >= prevFrom && d <= prevTo) {
      prevSales[sm] += data.s[i];
    }
  }

  const alerts: Alert[] = [];
  for (let sm = 0; sm < salesmen.length; sm++) {
    if (prevSales[sm] <= 0) continue;
    const delta = ((curSales[sm] - prevSales[sm]) / prevSales[sm]) * 100;
    if (delta < -30) {
      alerts.push({
        id: `declining-sm-${sm}`,
        type: 'Declining Salesmen',
        severity: delta < -50 ? 'critical' : 'warning',
        title: `${salesmen[sm].n} sales dropped ${Math.abs(delta).toFixed(1)}%`,
        description: `Current: ${formatSAR(curSales[sm])} vs Previous: ${formatSAR(prevSales[sm])}`,
        action: 'Review salesman activity and schedule a performance meeting.',
        details: {
          name: salesmen[sm].n,
          currentSales: formatSAR(curSales[sm]),
          previousSales: formatSAR(prevSales[sm]),
          delta: `${delta.toFixed(1)}%`,
        },
      });
    }
  }
  return alerts;
}

function detectInactiveHighValueCustomers(ds: SalesDataset, indices: Uint32Array, refDay: number): Alert[] {
  const { data, customers } = ds;

  // Compute total sales and last order day per customer from filtered indices
  const totalSales = new Float64Array(customers.length);
  const lastOrderDay = new Int32Array(customers.length).fill(-1);

  for (const i of indices) {
    if (data.r[i] === 1) continue;
    const cu = data.cu[i];
    totalSales[cu] += data.s[i];
    if (data.d[i] > lastOrderDay[cu]) {
      lastOrderDay[cu] = data.d[i];
    }
  }

  const alerts: Alert[] = [];
  for (let cu = 0; cu < customers.length; cu++) {
    if (totalSales[cu] < 50000) continue;
    if (lastOrderDay[cu] < 0) continue;
    const daysIdle = refDay - lastOrderDay[cu];
    if (daysIdle >= 30) {
      const lastDateStr = dayIndexToString(lastOrderDay[cu]);
      alerts.push({
        id: `inactive-hv-${cu}`,
        type: 'Inactive High-Value Customers',
        severity: daysIdle >= 60 ? 'critical' : 'warning',
        title: `${customers[cu].n} idle for ${daysIdle} days`,
        description: `Last order: ${lastDateStr}. Historical revenue: ${formatSAR(totalSales[cu])}`,
        action: 'Reach out with a personalized offer to re-engage this customer.',
        details: {
          name: customers[cu].n,
          lastOrderDate: lastDateStr,
          daysIdle,
          historicalRevenue: formatSAR(totalSales[cu]),
        },
      });
    }
  }
  return alerts;
}

interface StockItem {
  sku: string;
  name: string;
  expiryDate: string;
  cases: number;
}

function detectExpiringStockRisk(): Alert[] {
  try {
    const raw = localStorage.getItem('roshen_stock_data');
    if (!raw) return [];
    const stockData: StockItem[] = JSON.parse(raw);
    if (!Array.isArray(stockData)) return [];

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 86400000);

    const alerts: Alert[] = [];
    for (const item of stockData) {
      if (!item.expiryDate || !item.cases) continue;
      const expiry = new Date(item.expiryDate);
      if (expiry <= thirtyDaysFromNow && item.cases > 100) {
        const daysUntilExpiry = Math.max(0, Math.round((expiry.getTime() - now.getTime()) / 86400000));
        alerts.push({
          id: `expiring-stock-${item.sku}`,
          type: 'Expiring Stock Risk',
          severity: daysUntilExpiry < 7 ? 'critical' : 'warning',
          title: `${item.name || item.sku} expires in ${daysUntilExpiry} days`,
          description: `${formatNumber(item.cases)} cases at risk. Expiry: ${item.expiryDate}`,
          action: 'Prioritize selling or redistributing this stock immediately.',
          details: {
            skuName: item.name || item.sku,
            expiryDate: item.expiryDate,
            casesAtRisk: formatNumber(item.cases),
          },
        });
      }
    }
    return alerts;
  } catch {
    return [];
  }
}

function detectReturnSpikes(ds: SalesDataset, indices: Uint32Array, refDay: number): Alert[] {
  const { data, customers } = ds;
  const curFrom = refDay - 29;

  const custSales = new Float64Array(customers.length);
  const custReturns = new Float64Array(customers.length);

  for (const i of indices) {
    const d = data.d[i];
    if (d < curFrom || d > refDay) continue;
    const cu = data.cu[i];
    if (data.r[i] === 1) {
      custReturns[cu] += Math.abs(data.s[i]);
    } else {
      custSales[cu] += data.s[i];
    }
  }

  const alerts: Alert[] = [];
  for (let cu = 0; cu < customers.length; cu++) {
    const total = custSales[cu] + custReturns[cu];
    if (total <= 0) continue;
    const returnRate = (custReturns[cu] / total) * 100;
    if (returnRate > 20) {
      alerts.push({
        id: `return-spike-${cu}`,
        type: 'Return Spikes',
        severity: returnRate > 50 ? 'critical' : 'warning',
        title: `${customers[cu].n} return rate ${returnRate.toFixed(1)}%`,
        description: `Returns: ${formatSAR(custReturns[cu])} out of ${formatSAR(total)} total.`,
        action: 'Investigate root cause of returns and address quality or fulfillment issues.',
        details: {
          customerName: customers[cu].n,
          returnRate: `${returnRate.toFixed(1)}%`,
          returnValue: formatSAR(custReturns[cu]),
        },
      });
    }
  }
  return alerts;
}

function detectLowCoverageBranches(ds: SalesDataset, indices: Uint32Array, refDay: number): Alert[] {
  const { data, customers, dims } = ds;
  const curFrom = refDay - 29;

  // Build total customers per branch
  const totalCustomersByBranch: Set<number>[] = dims.branches.map(() => new Set());
  for (const cu of customers) {
    totalCustomersByBranch[cu.br].add(cu.id);
  }

  // Build active customers per branch (last 30 days, sales only)
  const activeCustomersByBranch: Set<number>[] = dims.branches.map(() => new Set());
  for (const i of indices) {
    if (data.r[i] === 1) continue;
    const d = data.d[i];
    if (d < curFrom || d > refDay) continue;
    const cu = data.cu[i];
    const br = customers[cu].br;
    activeCustomersByBranch[br].add(cu);
  }

  const alerts: Alert[] = [];
  for (let br = 0; br < dims.branches.length; br++) {
    const totalCust = totalCustomersByBranch[br].size;
    if (totalCust < 5) continue; // skip tiny branches
    const activeCust = activeCustomersByBranch[br].size;
    const coverage = (activeCust / totalCust) * 100;
    if (coverage < 50) {
      alerts.push({
        id: `low-coverage-${br}`,
        type: 'Low Coverage Branches',
        severity: coverage < 25 ? 'critical' : 'info',
        title: `${dims.branches[br]} coverage ${coverage.toFixed(1)}%`,
        description: `${formatNumber(activeCust)} active of ${formatNumber(totalCust)} total customers.`,
        action: 'Assign additional salesmen or run targeted outreach in this branch.',
        details: {
          branch: dims.branches[br],
          activeCustomers: formatNumber(activeCust),
          totalCustomers: formatNumber(totalCust),
          coverage: `${coverage.toFixed(1)}%`,
        },
      });
    }
  }
  return alerts;
}

export function SmartAlerts({ dataset, indices }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

  const alerts = useMemo(() => {
    const refDay = stringToDayIndex(dataset.meta.dateMax);

    const all: Alert[] = [
      ...detectDeclingSalesmen(dataset, indices, refDay),
      ...detectInactiveHighValueCustomers(dataset, indices, refDay),
      ...detectExpiringStockRisk(),
      ...detectReturnSpikes(dataset, indices, refDay),
      ...detectLowCoverageBranches(dataset, indices, refDay),
    ];

    // Sort by severity
    all.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    return all;
  }, [dataset, indices]);

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;
  const infoCount = alerts.filter(a => a.severity === 'info').length;

  const alertsByType = useMemo(() => {
    const grouped = new Map<string, Alert[]>();
    for (const alert of alerts) {
      const existing = grouped.get(alert.type);
      if (existing) {
        existing.push(alert);
      } else {
        grouped.set(alert.type, [alert]);
      }
    }
    return grouped;
  }, [alerts]);

  const toggleType = (type: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  if (alerts.length === 0) return null;

  return (
    <div className="dash-card ring-1 ring-amber-200 overflow-hidden">
      {/* Collapsible header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[14px]">{'⚡'}</span>
          <span className="text-[13px] font-bold text-foreground">
            Smart Alerts ({alerts.length})
          </span>
          <div className="flex items-center gap-2 ml-2">
            {criticalCount > 0 && (
              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                {criticalCount} Critical
              </span>
            )}
            {warningCount > 0 && (
              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                {warningCount} Warning{warningCount > 1 ? 's' : ''}
              </span>
            )}
            {infoCount > 0 && (
              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {infoCount} Info
              </span>
            )}
          </div>
        </div>
        <span className="text-muted-foreground text-[12px]">
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {Array.from(alertsByType.entries()).map(([type, typeAlerts]) => {
            const isTypeExpanded = expandedTypes.has(type);
            const worstSeverity = typeAlerts.reduce<AlertSeverity>(
              (worst, a) => (SEVERITY_ORDER[a.severity] < SEVERITY_ORDER[worst] ? a.severity : worst),
              'info'
            );

            return (
              <div key={type} className="border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleType(type)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[12px]">{SEVERITY_ICON[worstSeverity]}</span>
                    <span className="text-[12px] font-bold text-foreground">{type}</span>
                    <span className="text-[11px] text-muted-foreground">
                      ({typeAlerts.length})
                    </span>
                  </div>
                  <span className="text-muted-foreground text-[11px]">
                    {isTypeExpanded ? '▲' : '▼'}
                  </span>
                </button>

                {isTypeExpanded && (
                  <div className="divide-y divide-border">
                    {typeAlerts.map(alert => (
                      <div key={alert.id} className="px-3 py-2.5 flex items-start gap-2.5">
                        <span className="text-[11px] mt-0.5 shrink-0">{SEVERITY_ICON[alert.severity]}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-semibold text-foreground leading-tight">
                            {alert.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                            {alert.description}
                          </p>
                          <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1 italic leading-snug">
                            {alert.action}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
