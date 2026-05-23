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
import { useLangStore, t } from '@/lib/i18n';
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
  const { lang, toggle: toggleLang } = useLangStore();
  const {
    dataset, isLoading, error, indices, kpis,
    monthlySales, regionSales, productSales, salesmanPerformance, channelSales,
  } = useFilteredSalesData();

  const handleDataLoaded = useCallback((newData: SalesDataset) => {
    queryClient.setQueryData(['sales-dataset'], newData);
  }, [queryClient]);

  function handlePrintView() {
    const pw = window.open('', '_blank');
    if (!pw || !contentRef.current) return;
    const tabLabel = TABS.find(t => t.id === activeTab)?.label || activeTab;
    pw.document.write(`<!DOCTYPE html><html><head><title>Roshen KSA — ${tabLabel}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Inter,-apple-system,'Segoe UI',sans-serif;padding:28px;color:#0f172a;line-height:1.6;font-size:12px}
        h1{font-size:16px;font-weight:800;letter-spacing:-0.02em}
        h3{font-size:13px;font-weight:700;margin:14px 0 8px}
        table{width:100%;border-collapse:collapse;margin:10px 0}
        th{background:#f1f5f9;font-weight:600;text-align:left;padding:7px 10px;border:1px solid #e2e8f0;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#64748b}
        td{padding:6px 10px;border:1px solid #e2e8f0}
        tr:nth-child(even){background:#f8fafc}
        .text-end{text-align:right}
        .hdr{border-bottom:2px solid #2563eb;padding-bottom:14px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:baseline}
        .sub{font-size:11px;color:#64748b}
        @media print{body{padding:12px}thead{display:table-header-group}tr{page-break-inside:avoid}}
      </style></head><body>
      <div class="hdr"><div><h1>ROSHEN KSA — ${tabLabel}</h1><div class="sub">${dataset?.meta.dateMin} → ${dataset?.meta.dateMax} · ${dataset?.meta.rows.toLocaleString()} transactions</div></div><div class="sub">${new Date().toLocaleDateString('en-GB')}</div></div>
      ${contentRef.current.innerHTML}
      <script>window.print();window.onafterprint=()=>window.close()<\/script></body></html>`);
    pw.document.close();
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="text-center space-y-5">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-2xl bg-primary/10 animate-ping" />
            <div className="relative w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <span className="text-2xl">📊</span>
            </div>
          </div>
          <div>
            <p className="font-bold text-foreground">{t('Loading Sales Data', lang)}</p>
            <p className="text-xs text-muted-foreground mt-1">Processing transactions...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !dataset || !kpis) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="text-center space-y-6 max-w-md px-6">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-lg shadow-primary/10">
            <span className="text-4xl">📤</span>
          </div>
          <div>
            <p className="text-xl font-extrabold text-foreground tracking-tight">{t('Welcome to Roshen KSA Dashboard', lang)}</p>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              Upload your sales Excel file to get started. Required columns: Invoice Date, Cust Account, Item Description, Sales Man, Inv Qty Cases, Invoice Amount ex Vat.
            </p>
          </div>
          <ExcelUpload onDataLoaded={handleDataLoaded} />
          {error && <p className="text-xs text-red-500">{error.message}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top Bar */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b">
        <div className="max-w-[1440px] mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-black text-sm shrink-0">R</div>
            <div className="min-w-0">
              <h1 className="text-sm font-extrabold text-foreground tracking-tight truncate">
                {t('Sales Dashboard', lang)} <span className="text-primary">— ROSHEN KSA</span>
              </h1>
              <p className="text-[11px] text-muted-foreground truncate">
                {dataset.meta.dateMin} → {dataset.meta.dateMax} · {dataset.meta.rows.toLocaleString()} {t('rows', lang)} · {dataset.salesmen.length} {t('salesmen', lang)} · {dataset.customers.length.toLocaleString()} {t('customers', lang)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={toggleLang}
              className="h-8 px-2.5 rounded-lg text-[12px] font-bold border hover:bg-muted transition-colors"
              title="Switch language"
            >
              {lang === 'en' ? '🇺🇦 UK' : '🇬🇧 EN'}
            </button>
            <ExcelUpload onDataLoaded={handleDataLoaded} />
            <button onClick={handlePrintView} className="dash-btn-ghost !h-8 !px-2.5 !text-[12px]">
              🖨️ <span className="hidden sm:inline">{t('Print', lang)}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-4 py-3 space-y-3">
        <SalesFilterBar dataset={dataset} />
        <SalesKPIGrid kpis={kpis} />

        {/* Tab Bar */}
        <div className="dash-card p-1 flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-[13px] font-semibold transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              <span className="text-[14px]">{tab.icon}</span>
              <span className="hidden sm:inline">{t(tab.label, lang)}</span>
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
    </div>
  );
}
