import { useState } from 'react';
import { useFilteredSalesData } from '@/hooks/useSalesData';
import { SalesKPIGrid } from '@/components/sales/SalesKPIGrid';
import { SalesFilterBar } from '@/components/sales/SalesFilterBar';
import { OverviewTab } from '@/components/sales/OverviewTab';
import { GeographyTab } from '@/components/sales/GeographyTab';
import { ProductsTab } from '@/components/sales/ProductsTab';
import { SalesTeamTab } from '@/components/sales/SalesTeamTab';

const TABS = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'geography', label: 'Geography', icon: '🌍' },
  { id: 'products', label: 'Products', icon: '🍫' },
  { id: 'team', label: 'Sales Team', icon: '👤' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function SalesDashboardPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const {
    dataset,
    isLoading,
    error,
    kpis,
    monthlySales,
    regionSales,
    productSales,
    salesmanPerformance,
    channelSales,
  } = useFilteredSalesData();

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
        <div className="text-center space-y-3">
          <div className="text-4xl">❌</div>
          <p className="text-red-500 font-medium">Failed to load sales data</p>
          <p className="text-xs text-muted-foreground">{error?.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <span className="text-2xl">📊</span>
            Sales Dashboard
            <span className="text-primary font-black">— ROSHEN KSA</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {dataset.meta.dateMin} → {dataset.meta.dateMax} •{' '}
            {dataset.salesmen.length} Salesmen •{' '}
            {dataset.customers.length.toLocaleString()} Customers •{' '}
            {dataset.skus.length} SKUs
          </p>
        </div>
      </div>

      <SalesFilterBar dataset={dataset} />

      <SalesKPIGrid kpis={kpis} />

      <div className="flex items-center gap-1 bg-card rounded-xl border p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <OverviewTab
          monthlySales={monthlySales}
          regionSales={regionSales}
          channelSales={channelSales}
        />
      )}
      {activeTab === 'geography' && <GeographyTab regionSales={regionSales} />}
      {activeTab === 'products' && <ProductsTab productSales={productSales} />}
      {activeTab === 'team' && <SalesTeamTab salesmanPerformance={salesmanPerformance} />}
    </div>
  );
}
