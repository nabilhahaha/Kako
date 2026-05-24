import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { Printer } from 'lucide-react';
import type { RouteResult } from '../types';

interface JourneyPlanPrintProps {
  routes: RouteResult[];
  outstationRoutes: RouteResult[];
  selectedRoute: number | null;
  selectedDay: number | null;
  salesmanNames: Map<number, string>;
}

const DAY_KEYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] as const;

export function JourneyPlanPrint({ routes, outstationRoutes, selectedRoute, selectedDay, salesmanNames }: JourneyPlanPrintProps) {
  const { t, i18n } = useTranslation();
  const printRef = useRef<HTMLDivElement>(null);
  const isRTL = i18n.language === 'ar';

  const allRoutes = [...routes, ...outstationRoutes];
  const routesToPrint = selectedRoute !== null ? [allRoutes[selectedRoute]] : allRoutes;

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
        <title>${t('print.journeyPlanTitle')}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: ${isRTL ? "'IBM Plex Sans Arabic', " : ''}'Inter', system-ui, sans-serif;
            color: #000;
            background: #fff;
            font-size: 11pt;
            direction: ${isRTL ? 'rtl' : 'ltr'};
          }
          .page {
            page-break-after: always;
            padding: 15mm;
            min-height: 297mm;
            position: relative;
          }
          .page:last-child { page-break-after: avoid; }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #333;
            padding-bottom: 8px;
            margin-bottom: 12px;
          }
          .header-left h1 { font-size: 16pt; font-weight: 700; }
          .header-left p { font-size: 9pt; color: #666; margin-top: 2px; }
          .header-right { text-align: ${isRTL ? 'left' : 'right'}; font-size: 9pt; }
          .header-right strong { display: block; font-size: 11pt; }
          .summary {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            margin-bottom: 16px;
            background: #f5f5f5;
            padding: 10px;
            border-radius: 4px;
          }
          .summary-item label { font-size: 8pt; color: #666; display: block; }
          .summary-item span { font-size: 11pt; font-weight: 600; }
          .day-section { margin-bottom: 14px; }
          .day-header {
            background: #333;
            color: #fff;
            padding: 6px 10px;
            font-size: 11pt;
            font-weight: 600;
          }
          table { width: 100%; border-collapse: collapse; font-size: 10pt; }
          th { background: #e5e5e5; padding: 5px 8px; text-align: ${isRTL ? 'right' : 'left'}; font-weight: 600; border: 1px solid #ccc; }
          td { padding: 5px 8px; border: 1px solid #ccc; }
          .checkbox { width: 14px; height: 14px; border: 1.5px solid #333; display: inline-block; }
          .day-footer {
            display: flex;
            justify-content: space-between;
            background: #f5f5f5;
            padding: 5px 10px;
            font-size: 9pt;
            border: 1px solid #ccc;
            border-top: none;
          }
          .signature {
            margin-top: 30px;
            display: flex;
            justify-content: space-between;
          }
          .sig-block {
            width: 45%;
            border-top: 1px solid #333;
            padding-top: 5px;
            font-size: 9pt;
          }
          .qr-code { display: inline-block; margin-top: 4px; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .page { padding: 10mm; }
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

  return (
    <div>
      <button
        onClick={handlePrint}
        className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <Printer className="h-4 w-4" />
        {t('print.journeyPlan')}
      </button>

      <div ref={printRef} className="hidden">
        {routesToPrint.map((route, ri) => {
          if (!route) return null;
          const routeLabel = ri < routes.length
            ? t('routeCards.routeNumber', { number: ri + 1 })
            : `${t('routeCards.outstationLabel')} ${ri - routes.length + 1}`;

          const plansToShow = selectedDay !== null
            ? route.dailyPlans.filter((dp) => dp.dayIndex === selectedDay)
            : route.dailyPlans;

          return (
            <div key={ri} className="page">
              <div className="header">
                <div className="header-left">
                  <h1>JPFOOD</h1>
                  <p>{t('print.journeyPlanTitle')}</p>
                </div>
                <div className="header-right">
                  <strong>{routeLabel}</strong>
                  {salesmanNames.get(ri) && (
                    <p style={{ fontWeight: 600 }}>Salesman: {salesmanNames.get(ri)}</p>
                  )}
                  <p>{t('print.issueDate')}: {new Date().toLocaleDateString(i18n.language)}</p>
                  <p>{t('routeCards.routeType')}: {route.routeType === 'outstation' ? t('routeCards.outstationLabel') : t('map.normalRoute')}</p>
                </div>
              </div>

              <div className="summary">
                <div className="summary-item">
                  <label>{t('print.totalCustomers')}</label>
                  <span>{route.totalCustomers}</span>
                </div>
                <div className="summary-item">
                  <label>{t('print.workingDays')}</label>
                  <span>{route.dailyPlans.length}</span>
                </div>
                <div className="summary-item">
                  <label>{t('routeCards.weeklyKm')}</label>
                  <span>{route.weeklyKm.toFixed(0)} {t('common.km')}</span>
                </div>
                <div className="summary-item">
                  <label>{t('routeCards.sellingTimeRatio')}</label>
                  <span>{(route.sellingTimeRatio * 100).toFixed(0)}%</span>
                </div>
              </div>

              {plansToShow.map((dp) => (
                <div key={dp.dayIndex} className="day-section">
                  <div className="day-header">
                    {t(`print.days.${DAY_KEYS[dp.dayIndex] ?? 'saturday'}`)}
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '5%' }}>#</th>
                        <th style={{ width: '12%' }}>{t('print.tableHeaders.customerCode')}</th>
                        <th style={{ width: '25%' }}>{t('print.tableHeaders.customerName')}</th>
                        <th style={{ width: '18%' }}>{t('print.tableHeaders.cityDistrict')}</th>
                        <th style={{ width: '8%' }}>{t('print.tableHeaders.frequency')}</th>
                        <th style={{ width: '8%' }}>{t('print.tableHeaders.done')}</th>
                        <th style={{ width: '24%' }}>{t('print.tableHeaders.notes')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dp.sequencedCustomers.map((c, seq) => (
                        <tr key={c.index}>
                          <td>{seq + 1}</td>
                          <td>{c.customerNo}</td>
                          <td>{i18n.language === 'ar' ? (c.customerNameA || c.customerNameE) : (c.customerNameE || c.customerNameA)}</td>
                          <td>{c.city}</td>
                          <td>{c.weeklyFreq}x</td>
                          <td style={{ textAlign: 'center' }}><span className="checkbox"></span></td>
                          <td></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="day-footer">
                    <span>{t('print.dayFooter.customersToday', { count: dp.sequencedCustomers.length })}</span>
                    <span>{t('print.dayFooter.expectedKm', { km: dp.distanceKm.toFixed(1) })}</span>
                    <span>{t('common.hours')}: {dp.totalHours.toFixed(1)}</span>
                  </div>
                  {dp.googleMapsUrl && (
                    <div style={{ marginTop: '4px' }}>
                      <span className="qr-code">
                        <QRCodeSVG value={dp.googleMapsUrl} size={60} />
                      </span>
                    </div>
                  )}
                </div>
              ))}

              <div className="signature">
                <div className="sig-block">{t('print.signatureArea.salesmanSignature')}</div>
                <div className="sig-block">{t('print.signatureArea.supervisorSignature')}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
