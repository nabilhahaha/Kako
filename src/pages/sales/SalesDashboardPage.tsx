import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useFilteredSalesData } from '@/hooks/useSalesData';
import { SalesKPIGrid } from '@/components/sales/SalesKPIGrid';
import { SalesFilterBar } from '@/components/sales/SalesFilterBar';
import { OverviewTab } from '@/components/sales/OverviewTab';
import { TrendTab } from '@/components/sales/TrendTab';
import { GeographyTab } from '@/components/sales/GeographyTab';
import { CustomersTab } from '@/components/sales/CustomersTab';
import { ProductsTab } from '@/components/sales/ProductsTab';
import { SalesTeamTab } from '@/components/sales/SalesTeamTab';
import { ReturnsTab } from '@/components/sales/ReturnsTab';
import { RisksTab } from '@/components/sales/RisksTab';
import { LostCustomersTab } from '@/components/sales/LostCustomersTab';
import { ProfilesTab } from '@/components/sales/ProfilesTab';
import { PromoTab } from '@/components/sales/PromoTab';
import { InvoiceTab } from '@/components/sales/InvoiceTab';
import { ExcelUpload } from '@/components/sales/ExcelUpload';
import type { SalesDataset } from '@/lib/salesTypes';

const TABS = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'trend', label: 'Trend', icon: '📈' },
  { id: 'geography', label: 'Geography', icon: '🌍' },
  { id: 'customers', label: 'Customers', icon: '👥' },
  { id: 'products', label: 'Products', icon: '🍫' },
  { id: 'team', label: 'Sales Team', icon: '👤' },
  { id: 'returns', label: 'Returns', icon: '🔁' },
  { id: 'risks', label: 'Risks', icon: '🚨' },
  { id: 'lost', label: 'Lost', icon: '🎯' },
  { id: 'profiles', label: 'Profiles', icon: '🔍' },
  { id: 'promo', label: 'Promo', icon: '🎁' },
  { id: 'invoice', label: 'Invoice 360', icon: '📄' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function SalesDashboardPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const queryClient = useQueryClient();
  const contentRef = useRef<HTMLDivElement>(null);
  const {
    dataset,
    isLoading,
    error,
    indices,
    kpis,
    monthlySales,
    regionSales,
    productSales,
    salesmanPerformance,
    channelSales,
  } = useFilteredSalesData();

  const handleDataLoaded = useCallback((newData: SalesDataset) => {
    queryClient.setQueryData(['sales-dataset'], newData);
  }, [queryClient]);

  function handlePrintView() {
    const printWindow = window.open('', '_blank');
    if (!printWindow || !contentRef.current) return;
    const tabLabel = TABS.find(t => t.id === activeTab)?.label || activeTab;
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Roshen KSA — ${tabLabel}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, 'Segoe UI', Inter, sans-serif; padding: 24px; color: #1a1a2e; line-height: 1.5; }
        h1 { font-size: 18px; font-weight: 800; margin-bottom: 4px; }
        h2, h3 { font-size: 14px; font-weight: 700; margin: 12px 0 8px; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11px; }
        th { background: #f1f5f9; font-weight: 700; text-align: left; padding: 8px 10px; border: 1px solid #e2e8f0; }
        td { padding: 6px 10px; border: 1px solid #e2e8f0; }
        tr:nth-child(even) { background: #f8fafc; }
        .text-end { text-align: right; }
        .print-header { border-bottom: 2px solid #dc2626; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: baseline; }
        .print-header .subtitle { font-size: 12px; color: #64748b; }
        @media print { body { padding: 10px; } thead { display: table-header-group; } tr { page-break-inside: avoid; } }
      </style></head><body>
      <div class="print-header">
        <div><h1>ROSHEN KSA — ${tabLabel}</h1><div class="subtitle">${dataset?.meta.dateMin} → ${dataset?.meta.dateMax} • ${dataset?.meta.rows.toLocaleString()} transactions</div></div>
        <div class="subtitle">Printed: ${new Date().toLocaleDateString('en-GB')}</div>
      </div>
      ${contentRef.current.innerHTML}
      <script>window.print(); window.onafterprint = () => window.close();<\/script>
      </body></html>`);
    printWindow.document.close();
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <span className="text-3xl animate-pulse">📊</span>
          </div>
          <div>
            <p className="text-foreground font-bold">Loading Sales Data</p>
            <p className="text-xs text-muted-foreground mt-1">Processing transactions...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !dataset || !kpis) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-5 max-w-lg px-6">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center">
            <span className="text-4xl">📤</span>
          </div>
          <div>
            <p className="text-xl font-bold text-foreground">Welcome to Roshen KSA Dashboard</p>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Upload your sales Excel file to see analytics across customers, products, salesmen, regions, and more.
              Required columns: Invoice Date, Cust Account, Item Description, Sales Man, Inv Qty Cases, Invoice Amount ex Vat.
            </p>
          </div>
          <ExcelUpload onDataLoaded={handleDataLoaded} />
          {error && <p className="text-xs text-red-500">{error.message}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3 sm:p-4 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
            Sales Dashboard
            <span className="text-primary">— ROSHEN KSA</span>
          </h1>
          <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
            {dataset.meta.dateMin} → {dataset.meta.dateMax}
            <span className="mx-1.5 text-border">|</span>
            {dataset.meta.rows.toLocaleString()} rows
            <span className="mx-1.5 text-border">|</span>
            {dataset.salesmen.length} salesmen
            <span className="mx-1.5 text-border">|</span>
            {dataset.customers.length.toLocaleString()} customers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExcelUpload onDataLoaded={handleDataLoaded} />
          <button onClick={handlePrintView}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold border hover:bg-muted transition-colors">
            🖨️ <span className="hidden sm:inline">Print</span>
          </button>
        </div>
      </div>

      <SalesFilterBar dataset={dataset} />
      <SalesKPIGrid kpis={kpis} />

      {/* Tab Bar */}
      <div className="flex items-center gap-0.5 bg-card rounded-xl border p-1 overflow-x-auto scrollbar-hide">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground shadow-sm scale-[1.02]'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            }`}
          >
            <span className="text-sm">{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div ref={contentRef}>
        {activeTab === 'overview' && <OverviewTab monthlySales={monthlySales} regionSales={regionSales} channelSales={channelSales} />}
        {activeTab === 'trend' && <TrendTab monthlySales={monthlySales} />}
        {activeTab === 'geography' && <GeographyTab regionSales={regionSales} />}
        {activeTab === 'customers' && <CustomersTab dataset={dataset} indices={indices} />}
        {activeTab === 'products' && <ProductsTab productSales={productSales} />}
        {activeTab === 'team' && <SalesTeamTab salesmanPerformance={salesmanPerformance} />}
        {activeTab === 'returns' && <ReturnsTab dataset={dataset} indices={indices} />}
        {activeTab === 'risks' && <RisksTab dataset={dataset} indices={indices} />}
        {activeTab === 'lost' && <LostCustomersTab dataset={dataset} />}
        {activeTab === 'profiles' && <ProfilesTab dataset={dataset} indices={indices} />}
        {activeTab === 'promo' && <PromoTab dataset={dataset} indices={indices} />}
        {activeTab === 'invoice' && <InvoiceTab dataset={dataset} indices={indices} />}
      </div>
    </div>
  );
}
