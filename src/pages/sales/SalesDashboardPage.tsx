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
import { JourneyTab } from '@/components/sales/JourneyTab';
import { DailyTab } from '@/components/sales/DailyTab';
import { CoverageTab } from '@/components/sales/CoverageTab';
import { StockReportTab } from '@/components/sales/StockReportTab';
import { ExcelUpload } from '@/components/sales/ExcelUpload';
import { useLangStore, t } from '@/lib/i18n';
import { useThemeStore } from '@/stores/themeStore';
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
  { id: 'journey', label: 'Journey', icon: '🧬' },
  { id: 'daily', label: 'Daily', icon: '📅' },
  { id: 'coverage', label: 'Coverage', icon: '🗺️' },
  { id: 'stock', label: 'Stock Report', icon: '📦' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function SalesDashboardPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const queryClient = useQueryClient();
  const contentRef = useRef<HTMLDivElement>(null);
  const { lang, toggle: toggleLang } = useLangStore();
  const { theme, toggle: toggleTheme } = useThemeStore();
  const {
    dataset, isLoading, error, indices, kpis,
    monthlySales, regionSales, productSales, salesmanPerformance, channelSales,
  } = useFilteredSalesData();

  const handleDataLoaded = useCallback((newData: SalesDataset) => {
    queryClient.setQueryData(['sales-dataset'], newData);
    try {
      localStorage.setItem('roshen_sales_data', JSON.stringify(newData));
    } catch {
      // localStorage might be full; silently ignore
    }
  }, [queryClient]);

  const handleClearCache = useCallback(() => {
    localStorage.removeItem('roshen_sales_data');
    queryClient.removeQueries({ queryKey: ['sales-dataset'] });
    window.location.reload();
  }, [queryClient]);

  function handlePrint() {
    const pw = window.open('', '_blank');
    if (!pw || !contentRef.current) return;
    const label = TABS.find(t => t.id === activeTab)?.label || activeTab;
    pw.document.write(`<!DOCTYPE html><html><head><title>Roshen KSA — ${label}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,-apple-system,sans-serif;padding:24px;color:#0f172a;font-size:12px;line-height:1.6}
h1{font-size:15px;font-weight:800}h3{font-size:12px;font-weight:700;margin:12px 0 6px}
table{width:100%;border-collapse:collapse;margin:8px 0}th{background:#f8fafc;font-weight:600;text-align:left;padding:6px 10px;border:1px solid #e2e8f0;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#64748b}
td{padding:5px 10px;border:1px solid #e2e8f0;font-size:11px}tr:nth-child(even){background:#fafbfc}.text-end{text-align:right}
.hdr{border-bottom:3px solid #E30613;padding-bottom:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:end}
.sub{font-size:10px;color:#64748b}.roshen{color:#E30613}
@media print{body{padding:8px}thead{display:table-header-group}tr{page-break-inside:avoid}}</style></head><body>
<div class="hdr"><div><h1>ROSHEN KSA <span class="roshen">Sales Dashboard</span></h1><div class="sub">${label} · ${dataset?.meta.dateMin} → ${dataset?.meta.dateMax} · ${dataset?.meta.rows.toLocaleString()} transactions</div></div><div class="sub">${new Date().toLocaleDateString('en-GB')}</div></div>
${contentRef.current.innerHTML}
<script>window.print();window.onafterprint=()=>window.close()<\/script></body></html>`);
    pw.document.close();
  }

  // Loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #E30613, #c00510)' }}>
            <span className="text-white text-xl font-black">R</span>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-foreground">{t('Loading Sales Data', lang)}</p>
            <div className="w-32 h-1 mx-auto bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full animate-pulse" style={{ width: '60%', background: '#E30613' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Empty / error
  if (error || !dataset || !kpis) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-5 max-w-md px-6">
          <div className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #E30613 0%, #c00510 100%)', boxShadow: '0 8px 32px rgb(227 6 19 / 0.25)' }}>
            <span className="text-white text-3xl font-black">R</span>
          </div>
          <div>
            <p className="text-xl font-extrabold text-foreground tracking-tight">{t('Welcome to Roshen KSA Dashboard', lang)}</p>
            <p className="text-[13px] text-muted-foreground mt-3 leading-relaxed">
              Upload your sales Excel file to visualize 100K+ transactions across customers, products, salesmen and regions.
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
      {/* ═══ Top Nav ═══ */}
      <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur-xl" style={{ borderColor: 'hsl(var(--border))' }}>
        <div className="max-w-[1440px] mx-auto h-12 px-4 flex items-center justify-between gap-4">
          {/* Left: Brand */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #E30613, #c00510)' }}>
              <span className="text-white text-xs font-black">R</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-[13px] font-extrabold tracking-tight text-foreground leading-none">
                {t('Sales Dashboard', lang)}
                <span className="ml-1.5 font-bold" style={{ color: '#E30613' }}>ROSHEN KSA</span>
              </h1>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">
                {dataset.meta.dateMin} → {dataset.meta.dateMax} · {dataset.meta.rows.toLocaleString()} {t('rows', lang)}
              </p>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={toggleTheme} title="Toggle dark mode"
              className="dash-btn-ghost !h-7 !px-2 !text-[11px]">
              {theme === 'light' ? '\u{1F319}' : '\u{2600}\u{FE0F}'}
            </button>
            <button onClick={toggleLang} title="Switch language"
              className="dash-btn-ghost !h-7 !px-2 !text-[11px] !gap-1">
              {lang === 'en' ? '🇺🇦 УКР' : '🇬🇧 ENG'}
            </button>
            <ExcelUpload onDataLoaded={handleDataLoaded} />
            <button onClick={handleClearCache} title="Clear cached data"
              className="text-[10px] text-muted-foreground hover:text-destructive transition-colors underline">
              {t('Clear cache', lang)}
            </button>
            <button onClick={handlePrint} className="dash-btn-ghost !h-7 !px-2 !text-[11px]">
              🖨️
            </button>
          </div>
        </div>
      </header>

      {/* ═══ Body ═══ */}
      <main className="max-w-[1440px] mx-auto px-4 py-3 space-y-3">
        <SalesFilterBar dataset={dataset} />
        <SalesKPIGrid kpis={kpis} />

        {/* ═══ Tab Bar ═══ */}
        <nav className="dash-card px-1 py-1 flex items-center gap-px overflow-x-auto scrollbar-hide">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1 px-3 py-[6px] rounded-md text-[12px] font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'text-white'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
                style={isActive ? { background: 'linear-gradient(135deg, #E30613, #c00510)' } : undefined}
              >
                <span className="text-[13px]">{tab.icon}</span>
                <span className="hidden sm:inline">{t(tab.label, lang)}</span>
              </button>
            );
          })}
        </nav>

        {/* ═══ Content ═══ */}
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
          {activeTab === 'journey' && <JourneyTab dataset={dataset} indices={indices} />}
          {activeTab === 'daily' && <DailyTab dataset={dataset} indices={indices} />}
          {activeTab === 'coverage' && <CoverageTab dataset={dataset} indices={indices} />}
          {activeTab === 'stock' && <StockReportTab dataset={dataset} indices={indices} />}
        </div>
      </main>
    </div>
  );
}
