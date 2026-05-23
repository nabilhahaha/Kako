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
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Roshen KSA — ${activeTab}</title>
      <style>
        body { font-family: -apple-system, 'Segoe UI', sans-serif; padding: 20px; color: #1a1a1a; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        th, td { padding: 6px 10px; border: 1px solid #ddd; font-size: 12px; }
        th { background: #f5f5f5; font-weight: 700; }
        .text-end { text-align: right; }
        h1, h2, h3 { margin: 8px 0; }
        @media print { body { padding: 5px; } }
      </style></head><body>
      <h2>Roshen KSA — Sales Dashboard — ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h2>
      ${contentRef.current.innerHTML}
      <script>window.print(); window.onafterprint = () => window.close();<\/script>
      </body></html>`);
    printWindow.document.close();
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="text-4xl animate-pulse">📊</div>
          <p className="text-muted-foreground font-medium">Loading sales data...</p>
          <p className="text-xs text-muted-foreground">Processing 100K+ transactions</p>
        </div>
      </div>
    );
  }

  if (error || !dataset || !kpis) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="text-5xl">📤</div>
          <p className="text-lg font-bold text-foreground">No data loaded</p>
          <p className="text-sm text-muted-foreground max-w-md">
            Upload your Roshen KSA sales Excel file to get started.
            The file should contain columns: Invoice Date, Cust Account,
            Item Description, Sales Man, Inv Qty Cases, Invoice Amount ex Vat.
          </p>
          <ExcelUpload onDataLoaded={handleDataLoaded} />
          {error && (
            <p className="text-xs text-red-500 mt-2">{error.message}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <span className="text-2xl">📊</span>
            Sales Dashboard
            <span className="text-primary font-black">— ROSHEN KSA</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {dataset.meta.dateMin} → {dataset.meta.dateMax} •{' '}
            {dataset.meta.rows.toLocaleString()} transactions •{' '}
            {dataset.salesmen.length} Salesmen •{' '}
            {dataset.customers.length.toLocaleString()} Customers •{' '}
            {dataset.skus.length} SKUs
          </p>
        </div>
        <ExcelUpload onDataLoaded={handleDataLoaded} />
      </div>

      <SalesFilterBar dataset={dataset} />

      <SalesKPIGrid kpis={kpis} />

      <div className="flex items-center gap-1 bg-card rounded-xl border p-1 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      <div ref={contentRef}>
        {activeTab === 'overview' && (
          <OverviewTab
            monthlySales={monthlySales}
            regionSales={regionSales}
            channelSales={channelSales}
          />
        )}
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

      <div className="flex items-center justify-center pt-4 pb-8 border-t">
        <button
          onClick={handlePrintView}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm"
        >
          🖨️ Print Current View
        </button>
      </div>
    </div>
  );
}
