import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react';
import type { OptimizationResult } from '../types';

interface MasterPlanPrintProps {
  result: OptimizationResult;
}

export function MasterPlanPrint({ result }: MasterPlanPrintProps) {
  const { t, i18n } = useTranslation();
  const printRef = useRef<HTMLDivElement>(null);
  const isRTL = i18n.language === 'ar';

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="${i18n.language}" dir="${isRTL ? 'rtl' : 'ltr'}">
      <head>
        <meta charset="utf-8">
        <title>${t('print.masterPlanTitle')}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: ${isRTL ? "'IBM Plex Sans Arabic', " : ''}'Inter', system-ui, sans-serif;
            color: #000;
            background: #fff;
            font-size: 11pt;
            direction: ${isRTL ? 'rtl' : 'ltr'};
          }
          .page { padding: 15mm; }
          .header {
            border-bottom: 2px solid #333;
            padding-bottom: 8px;
            margin-bottom: 16px;
          }
          .header h1 { font-size: 18pt; font-weight: 700; }
          .header p { font-size: 9pt; color: #666; margin-top: 4px; }
          .kpis {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            margin-bottom: 20px;
          }
          .kpi-item {
            background: #f5f5f5;
            padding: 10px;
            border-radius: 4px;
          }
          .kpi-item label { font-size: 8pt; color: #666; display: block; }
          .kpi-item span { font-size: 14pt; font-weight: 700; }
          table { width: 100%; border-collapse: collapse; font-size: 10pt; margin-bottom: 16px; }
          th { background: #e5e5e5; padding: 6px 8px; text-align: ${isRTL ? 'right' : 'left'}; font-weight: 600; border: 1px solid #ccc; }
          td { padding: 6px 8px; border: 1px solid #ccc; }
          .section-title { font-size: 12pt; font-weight: 600; margin: 16px 0 8px; }
          .warning { color: #b45309; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>${printContent.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 300);
  };

  const { kpis } = result;
  const allRoutes = [...result.routes, ...result.outstationRoutes];

  return (
    <div>
      <button
        onClick={handlePrint}
        className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
      >
        <FileText className="h-4 w-4" />
        {t('print.masterPlan')}
      </button>

      <div ref={printRef} className="hidden">
        <div className="page">
          <div className="header">
            <h1>JPFOOD — {t('print.masterPlanTitle')}</h1>
            <p>{t('print.issueDate')}: {new Date().toLocaleDateString(i18n.language)}</p>
          </div>

          <div className="kpis">
            <div className="kpi-item">
              <label>{t('kpi.totalRoutes')}</label>
              <span>{kpis.totalRoutes}</span>
            </div>
            <div className="kpi-item">
              <label>{t('kpi.distributedCustomers')}</label>
              <span>{kpis.distributedCustomers}</span>
            </div>
            <div className="kpi-item">
              <label>{t('kpi.monthlyDistance')}</label>
              <span>{kpis.monthlyDistance.toFixed(0)} {t('common.km')}</span>
            </div>
            <div className="kpi-item">
              <label>{t('kpi.avgSellingTime')}</label>
              <span>{(kpis.avgSellingTime * 100).toFixed(1)}%</span>
            </div>
          </div>

          <h2 className="section-title">{t('routeCards.title')}</h2>
          <table>
            <thead>
              <tr>
                <th>{t('visitTable.columns.route')}</th>
                <th>{t('routeCards.routeType')}</th>
                <th>{t('map.customers')}</th>
                <th>{t('routeCards.weeklyKm')}</th>
                <th>{t('routeCards.monthlyKm')}</th>
                <th>{t('routeCards.avgDailyHours')}</th>
                <th>{t('routeCards.sellingTimeRatio')}</th>
                <th>{t('common.warning')}</th>
              </tr>
            </thead>
            <tbody>
              {allRoutes.map((route, i) => (
                <tr key={i}>
                  <td>
                    {i < result.routes.length
                      ? t('routeCards.routeNumber', { number: i + 1 })
                      : `${t('routeCards.outstationLabel')} ${i - result.routes.length + 1}`}
                  </td>
                  <td>{route.routeType === 'outstation' ? t('routeCards.outstationLabel') : t('map.normalRoute')}</td>
                  <td>{route.totalCustomers}</td>
                  <td>{route.weeklyKm.toFixed(0)}</td>
                  <td>{route.monthlyKm.toFixed(0)}</td>
                  <td>{route.avgDailyHours.toFixed(1)}</td>
                  <td>{(route.sellingTimeRatio * 100).toFixed(0)}%</td>
                  <td className="warning">{route.warnings.join('; ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {result.unassignedCustomers.length > 0 && (
            <>
              <h2 className="section-title">{t('kpi.unassignedCustomers')} ({result.unassignedCustomers.length})</h2>
              <table>
                <thead>
                  <tr>
                    <th>{t('visitTable.columns.customerCode')}</th>
                    <th>{t('visitTable.columns.customerName')}</th>
                    <th>{t('visitTable.columns.city')}</th>
                    <th>{t('visitTable.columns.latitude')}</th>
                    <th>{t('visitTable.columns.longitude')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.unassignedCustomers.map((c) => (
                    <tr key={c.index}>
                      <td>{c.customerNo}</td>
                      <td>{c.customerNameE || c.customerNameA}</td>
                      <td>{c.city}</td>
                      <td>{c.lat.toFixed(6)}</td>
                      <td>{c.lng.toFixed(6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {result.needsDecision.length > 0 && (
            <>
              <h2 className="section-title">{t('kpi.needsDecisionSection')} ({result.needsDecision.length})</h2>
              <table>
                <thead>
                  <tr>
                    <th>{t('visitTable.columns.customerCode')}</th>
                    <th>{t('visitTable.columns.customerName')}</th>
                    <th>{t('visitTable.columns.city')}</th>
                    <th>{t('visitTable.columns.latitude')}</th>
                    <th>{t('visitTable.columns.longitude')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.needsDecision.map((c) => (
                    <tr key={c.index}>
                      <td>{c.customerNo}</td>
                      <td>{c.customerNameE || c.customerNameA}</td>
                      <td>{c.city}</td>
                      <td>{c.lat.toFixed(6)}</td>
                      <td>{c.lng.toFixed(6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
