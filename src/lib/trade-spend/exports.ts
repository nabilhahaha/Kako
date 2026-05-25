import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PptxGenJS from 'pptxgenjs';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface ExportData {
  title: string;
  date: string;
  customers: Array<{
    account: string;
    name: string;
    classification: string;
    campaignCount: number;
    totalSpend: number;
    roshenShare: number;
    distributorShare: number;
    salesBefore: number;
    salesAfter: number;
    uplift: number;
    roiTotal: number | null;
    roiRoshen: number | null;
    spendToSales: number | null;
  }>;
  campaigns: Array<{
    id: string;
    customerName: string;
    spendType: string;
    duration: string;
    spendAmount: number;
    roshenPct: number;
    roshenShare: number;
    distributorShare: number;
    beforeValue: number;
    afterValue: number;
    upliftValue: number;
    upliftPct: number | null;
    roiTotal: number | null;
    roiRoshen: number | null;
    spendToSales: number | null;
    annualizedRoi: number | null;
    paybackDays: number | null;
    status: string;
    resultStatus: string;
  }>;
  transactions?: Array<{
    account: string;
    itemId: string;
    date: string;
    value: number;
    cases: number;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COLORS = {
  maroon: '#7A1D2E',
  gold: '#D4A843',
  white: '#FFFFFF',
  lightGray: '#F5F5F5',
} as const;

/** Format a number as currency string (no symbol, 2 decimals). */
function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format a percentage (already in %, e.g. 12.5 → "12.50%"). */
function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toFixed(2)}%`;
}

/** Format a number with 2 decimal places. */
function fmtNum(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toFixed(2);
}

/** Generate the download filename stem. */
function baseFilename(date: string): string {
  return `Trade_Spend_Report_${date}`;
}

/** Trigger a browser download from a Blob. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// 1. Excel export
// ---------------------------------------------------------------------------

export function exportToExcel(data: ExportData): void {
  try {
    const wb = XLSX.utils.book_new();

    // ---- Sheet 1: Summary ------------------------------------------------
    const summaryRows = data.customers.map((c) => ({
      Account: c.account,
      Name: c.name,
      Classification: c.classification,
      '# Campaigns': c.campaignCount,
      'Total Spend': c.totalSpend,
      'Roshen Share': c.roshenShare,
      'Distributor Share': c.distributorShare,
      'Sales Before': c.salesBefore,
      'Sales After': c.salesAfter,
      Uplift: c.uplift,
      'ROI Total': c.roiTotal,
      'ROI Roshen': c.roiRoshen,
      'Spend / Sales %': c.spendToSales,
    }));

    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);

    // Column widths
    wsSummary['!cols'] = [
      { wch: 14 }, // Account
      { wch: 28 }, // Name
      { wch: 16 }, // Classification
      { wch: 13 }, // # Campaigns
      { wch: 14 }, // Total Spend
      { wch: 14 }, // Roshen Share
      { wch: 16 }, // Distributor Share
      { wch: 14 }, // Sales Before
      { wch: 14 }, // Sales After
      { wch: 14 }, // Uplift
      { wch: 12 }, // ROI Total
      { wch: 12 }, // ROI Roshen
      { wch: 14 }, // Spend / Sales %
    ];

    // Auto-filter on header row
    wsSummary['!autofilter'] = { ref: wsSummary['!ref']! };

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // ---- Sheet 2: Campaign Detail ----------------------------------------
    const detailRows = data.campaigns.map((c) => ({
      'Campaign ID': c.id,
      Customer: c.customerName,
      'Spend Type': c.spendType,
      Duration: c.duration,
      'Spend Amount': c.spendAmount,
      'Roshen %': c.roshenPct,
      'Roshen Share': c.roshenShare,
      'Distributor Share': c.distributorShare,
      'Before Value': c.beforeValue,
      'After Value': c.afterValue,
      'Uplift Value': c.upliftValue,
      'Uplift %': c.upliftPct,
      'ROI Total': c.roiTotal,
      'ROI Roshen': c.roiRoshen,
      'Spend / Sales %': c.spendToSales,
      'Annualized ROI': c.annualizedRoi,
      'Payback Days': c.paybackDays,
      Status: c.status,
      'Result Status': c.resultStatus,
    }));

    const wsDetail = XLSX.utils.json_to_sheet(detailRows);

    wsDetail['!cols'] = [
      { wch: 14 }, // Campaign ID
      { wch: 28 }, // Customer
      { wch: 16 }, // Spend Type
      { wch: 10 }, // Duration
      { wch: 14 }, // Spend Amount
      { wch: 10 }, // Roshen %
      { wch: 14 }, // Roshen Share
      { wch: 16 }, // Distributor Share
      { wch: 14 }, // Before Value
      { wch: 14 }, // After Value
      { wch: 14 }, // Uplift Value
      { wch: 10 }, // Uplift %
      { wch: 12 }, // ROI Total
      { wch: 12 }, // ROI Roshen
      { wch: 14 }, // Spend / Sales %
      { wch: 14 }, // Annualized ROI
      { wch: 13 }, // Payback Days
      { wch: 18 }, // Status
      { wch: 14 }, // Result Status
    ];

    wsDetail['!autofilter'] = { ref: wsDetail['!ref']! };

    XLSX.utils.book_append_sheet(wb, wsDetail, 'Campaign Detail');

    // ---- Sheet 3: Transactions (optional) --------------------------------
    if (data.transactions && data.transactions.length > 0) {
      const txRows = data.transactions.map((t) => ({
        Account: t.account,
        'Item ID': t.itemId,
        Date: t.date,
        Value: t.value,
        Cases: t.cases,
      }));

      const wsTx = XLSX.utils.json_to_sheet(txRows);

      wsTx['!cols'] = [
        { wch: 14 }, // Account
        { wch: 14 }, // Item ID
        { wch: 12 }, // Date
        { wch: 14 }, // Value
        { wch: 10 }, // Cases
      ];

      wsTx['!autofilter'] = { ref: wsTx['!ref']! };

      XLSX.utils.book_append_sheet(wb, wsTx, 'Transactions');
    }

    // ---- Write & download ------------------------------------------------
    const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbOut], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    downloadBlob(blob, `${baseFilename(data.date)}.xlsx`);
  } catch (err) {
    console.error('Excel export failed:', err);
    alert('Failed to generate Excel report. Please try again.');
  }
}

// ---------------------------------------------------------------------------
// 2. PDF export
// ---------------------------------------------------------------------------

export function exportToPDF(data: ExportData): void {
  try {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();

    // ---- Header ----------------------------------------------------------
    doc.setFillColor(COLORS.maroon);
    doc.rect(0, 0, pageWidth, 22, 'F');

    doc.setTextColor(COLORS.white);
    doc.setFontSize(14);
    doc.text('Roshen Trade Spend Report', 14, 12);

    doc.setFontSize(9);
    doc.text(data.date, pageWidth - 14, 9, { align: 'right' });

    doc.setTextColor(COLORS.gold);
    doc.setFontSize(8);
    doc.text('CONFIDENTIAL', pageWidth - 14, 16, { align: 'right' });

    // ---- KPI block (2x2 grid) -------------------------------------------
    const kpiY = 30;
    const kpiW = 60;
    const kpiH = 20;
    const kpiGap = 8;
    const kpiStartX = (pageWidth - 2 * kpiW - kpiGap) / 2;

    const totalSpend = data.customers.reduce((s, c) => s + c.totalSpend, 0);
    const totalRoshenShare = data.customers.reduce((s, c) => s + c.roshenShare, 0);
    const totalUplift = data.customers.reduce((s, c) => s + c.uplift, 0);
    const roshenRois = data.campaigns
      .map((c) => c.roiRoshen)
      .filter((v): v is number => v != null);
    const avgRoiRoshen =
      roshenRois.length > 0
        ? roshenRois.reduce((a, b) => a + b, 0) / roshenRois.length
        : null;

    const kpis = [
      { label: 'Total Spend', value: fmtCurrency(totalSpend) },
      { label: 'Roshen Share', value: fmtCurrency(totalRoshenShare) },
      { label: 'Total Uplift', value: fmtCurrency(totalUplift) },
      { label: 'Avg ROI Roshen', value: avgRoiRoshen != null ? fmtNum(avgRoiRoshen) : '—' },
    ];

    kpis.forEach((kpi, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = kpiStartX + col * (kpiW + kpiGap);
      const y = kpiY + row * (kpiH + kpiGap);

      doc.setFillColor(COLORS.lightGray);
      doc.roundedRect(x, y, kpiW, kpiH, 2, 2, 'F');

      // Gold accent line at top
      doc.setFillColor(COLORS.gold);
      doc.rect(x, y, kpiW, 1.5, 'F');

      doc.setTextColor('#333333');
      doc.setFontSize(8);
      doc.text(kpi.label, x + kpiW / 2, y + 7, { align: 'center' });

      doc.setFontSize(12);
      doc.setTextColor(COLORS.maroon);
      doc.text(kpi.value, x + kpiW / 2, y + 15, { align: 'center' });
    });

    // ---- Customer Summary table ------------------------------------------
    const tableStartY = kpiY + 2 * (kpiH + kpiGap) + 8;

    autoTable(doc, {
      startY: tableStartY,
      head: [
        [
          'Account',
          'Name',
          'Class',
          '# Camp.',
          'Spend',
          'Roshen',
          'Distr.',
          'Before',
          'After',
          'Uplift',
          'ROI Tot.',
          'ROI Rosh.',
          'Sp/Sales',
        ],
      ],
      body: data.customers.map((c) => [
        c.account,
        c.name,
        c.classification,
        String(c.campaignCount),
        fmtCurrency(c.totalSpend),
        fmtCurrency(c.roshenShare),
        fmtCurrency(c.distributorShare),
        fmtCurrency(c.salesBefore),
        fmtCurrency(c.salesAfter),
        fmtCurrency(c.uplift),
        fmtNum(c.roiTotal),
        fmtNum(c.roiRoshen),
        fmtPct(c.spendToSales),
      ]),
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: {
        fillColor: COLORS.maroon,
        textColor: COLORS.white,
        fontStyle: 'bold',
        fontSize: 7,
      },
      alternateRowStyles: { fillColor: '#F9F5F6' },
      margin: { left: 10, right: 10 },
    });

    // ---- Campaign Detail tables (single-customer export) -----------------
    if (data.customers.length === 1 && data.campaigns.length > 0) {
      data.campaigns.forEach((camp) => {
        doc.addPage();

        // Campaign header
        doc.setFillColor(COLORS.maroon);
        doc.rect(0, 0, pageWidth, 14, 'F');
        doc.setTextColor(COLORS.white);
        doc.setFontSize(11);
        doc.text(`Campaign ${camp.id} — ${camp.customerName}`, 14, 9);

        const rows: [string, string][] = [
          ['Spend Type', camp.spendType],
          ['Duration', camp.duration],
          ['Spend Amount', fmtCurrency(camp.spendAmount)],
          ['Roshen %', fmtPct(camp.roshenPct)],
          ['Roshen Share', fmtCurrency(camp.roshenShare)],
          ['Distributor Share', fmtCurrency(camp.distributorShare)],
          ['Before Value', fmtCurrency(camp.beforeValue)],
          ['After Value', fmtCurrency(camp.afterValue)],
          ['Uplift Value', fmtCurrency(camp.upliftValue)],
          ['Uplift %', fmtPct(camp.upliftPct)],
          ['ROI Total', fmtNum(camp.roiTotal)],
          ['ROI Roshen', fmtNum(camp.roiRoshen)],
          ['Spend / Sales %', fmtPct(camp.spendToSales)],
          ['Annualized ROI', fmtNum(camp.annualizedRoi)],
          ['Payback Days', camp.paybackDays != null ? String(camp.paybackDays) : '—'],
          ['Status', camp.status],
          ['Result Status', camp.resultStatus],
        ];

        autoTable(doc, {
          startY: 20,
          head: [['Metric', 'Value']],
          body: rows,
          styles: { fontSize: 9, cellPadding: 2 },
          headStyles: {
            fillColor: COLORS.maroon,
            textColor: COLORS.white,
            fontStyle: 'bold',
          },
          columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 50 },
            1: { cellWidth: 60 },
          },
          margin: { left: 40, right: 40 },
        });
      });
    }

    // ---- Save ------------------------------------------------------------
    doc.save(`${baseFilename(data.date)}.pdf`);
  } catch (err) {
    console.error('PDF export failed:', err);
    alert('Failed to generate PDF report. Please try again.');
  }
}

// ---------------------------------------------------------------------------
// 3. PowerPoint export
// ---------------------------------------------------------------------------

export function exportToPPTX(data: ExportData): void {
  try {
    const pptx = new PptxGenJS();
    pptx.author = 'Roshen Trade Spend Platform';
    pptx.subject = 'Trade Spend Performance Report';

    // ---- Slide 1: Title --------------------------------------------------
    const slideTitle = pptx.addSlide();
    slideTitle.background = { color: COLORS.maroon.replace('#', '') };

    slideTitle.addText('Trade Spend\nPerformance Report', {
      x: 0.8,
      y: 1.2,
      w: 8.4,
      h: 2.0,
      fontSize: 32,
      fontFace: 'Arial',
      color: COLORS.white.replace('#', ''),
      bold: true,
      align: 'center',
      lineSpacingMultiple: 1.2,
    });

    slideTitle.addText(data.date, {
      x: 0.8,
      y: 3.4,
      w: 8.4,
      h: 0.5,
      fontSize: 16,
      fontFace: 'Arial',
      color: COLORS.gold.replace('#', ''),
      align: 'center',
    });

    slideTitle.addText('Roshen × Distributor', {
      x: 0.8,
      y: 4.1,
      w: 8.4,
      h: 0.5,
      fontSize: 14,
      fontFace: 'Arial',
      color: COLORS.white.replace('#', ''),
      align: 'center',
      italic: true,
    });

    // ---- Slide 2: Executive Summary KPI cards ----------------------------
    const slideSummary = pptx.addSlide();

    slideSummary.addText('Executive Summary', {
      x: 0.5,
      y: 0.3,
      w: 9,
      h: 0.6,
      fontSize: 22,
      fontFace: 'Arial',
      color: COLORS.maroon.replace('#', ''),
      bold: true,
    });

    // Gold divider line
    slideSummary.addShape(pptx.ShapeType.rect, {
      x: 0.5,
      y: 0.9,
      w: 9,
      h: 0.04,
      fill: { color: COLORS.gold.replace('#', '') },
      line: { color: COLORS.gold.replace('#', ''), width: 0 },
    });

    const totalSpend = data.customers.reduce((s, c) => s + c.totalSpend, 0);
    const totalRoshenShare = data.customers.reduce((s, c) => s + c.roshenShare, 0);
    const totalUplift = data.customers.reduce((s, c) => s + c.uplift, 0);
    const roshenRois = data.campaigns
      .map((c) => c.roiRoshen)
      .filter((v): v is number => v != null);
    const avgRoiRoshen =
      roshenRois.length > 0
        ? roshenRois.reduce((a, b) => a + b, 0) / roshenRois.length
        : null;

    const kpiCards = [
      { label: 'Total Spend', value: fmtCurrency(totalSpend) },
      { label: 'Roshen Share', value: fmtCurrency(totalRoshenShare) },
      { label: 'Total Uplift', value: fmtCurrency(totalUplift) },
      { label: 'Avg ROI Roshen', value: avgRoiRoshen != null ? fmtNum(avgRoiRoshen) : '—' },
    ];

    const cardW = 2.0;
    const cardH = 1.6;
    const cardGap = 0.35;
    const totalCardsW = 4 * cardW + 3 * cardGap;
    const cardStartX = (10 - totalCardsW) / 2;
    const cardY = 1.6;

    kpiCards.forEach((kpi, i) => {
      const x = cardStartX + i * (cardW + cardGap);

      // Card background
      slideSummary.addShape(pptx.ShapeType.rect, {
        x,
        y: cardY,
        w: cardW,
        h: cardH,
        fill: { color: 'F5F5F5' },
        rectRadius: 0.1,
        line: { color: COLORS.gold.replace('#', ''), width: 1 },
      });

      // Gold top accent
      slideSummary.addShape(pptx.ShapeType.rect, {
        x,
        y: cardY,
        w: cardW,
        h: 0.08,
        fill: { color: COLORS.gold.replace('#', '') },
        line: { color: COLORS.gold.replace('#', ''), width: 0 },
      });

      // Label
      slideSummary.addText(kpi.label, {
        x,
        y: cardY + 0.25,
        w: cardW,
        h: 0.4,
        fontSize: 10,
        fontFace: 'Arial',
        color: '666666',
        align: 'center',
      });

      // Value
      slideSummary.addText(kpi.value, {
        x,
        y: cardY + 0.7,
        w: cardW,
        h: 0.6,
        fontSize: 18,
        fontFace: 'Arial',
        color: COLORS.maroon.replace('#', ''),
        bold: true,
        align: 'center',
      });
    });

    // ---- Slide 3+: Customer/Campaign Details -----------------------------
    const isSingleCustomer = data.customers.length === 1;

    if (isSingleCustomer) {
      // One slide per campaign
      data.campaigns.forEach((camp) => {
        const slide = pptx.addSlide();

        slide.addText(`Campaign ${camp.id}`, {
          x: 0.5,
          y: 0.3,
          w: 9,
          h: 0.6,
          fontSize: 20,
          fontFace: 'Arial',
          color: COLORS.maroon.replace('#', ''),
          bold: true,
        });

        slide.addText(camp.customerName, {
          x: 0.5,
          y: 0.85,
          w: 9,
          h: 0.35,
          fontSize: 12,
          fontFace: 'Arial',
          color: '666666',
          italic: true,
        });

        // Gold divider
        slide.addShape(pptx.ShapeType.rect, {
          x: 0.5,
          y: 1.2,
          w: 9,
          h: 0.04,
          fill: { color: COLORS.gold.replace('#', '') },
          line: { color: COLORS.gold.replace('#', ''), width: 0 },
        });

        const metricsRows: Array<Array<{ text: string; options?: object }>> = [
          [
            { text: 'Spend Type', options: { bold: true } },
            { text: camp.spendType },
            { text: 'Duration', options: { bold: true } },
            { text: camp.duration },
          ],
          [
            { text: 'Spend Amount', options: { bold: true } },
            { text: fmtCurrency(camp.spendAmount) },
            { text: 'Roshen %', options: { bold: true } },
            { text: fmtPct(camp.roshenPct) },
          ],
          [
            { text: 'Roshen Share', options: { bold: true } },
            { text: fmtCurrency(camp.roshenShare) },
            { text: 'Distributor Share', options: { bold: true } },
            { text: fmtCurrency(camp.distributorShare) },
          ],
          [
            { text: 'Before Value', options: { bold: true } },
            { text: fmtCurrency(camp.beforeValue) },
            { text: 'After Value', options: { bold: true } },
            { text: fmtCurrency(camp.afterValue) },
          ],
          [
            { text: 'Uplift Value', options: { bold: true } },
            { text: fmtCurrency(camp.upliftValue) },
            { text: 'Uplift %', options: { bold: true } },
            { text: fmtPct(camp.upliftPct) },
          ],
          [
            { text: 'ROI Total', options: { bold: true } },
            { text: fmtNum(camp.roiTotal) },
            { text: 'ROI Roshen', options: { bold: true } },
            { text: fmtNum(camp.roiRoshen) },
          ],
          [
            { text: 'Spend / Sales %', options: { bold: true } },
            { text: fmtPct(camp.spendToSales) },
            { text: 'Annualized ROI', options: { bold: true } },
            { text: fmtNum(camp.annualizedRoi) },
          ],
          [
            { text: 'Payback Days', options: { bold: true } },
            { text: camp.paybackDays != null ? String(camp.paybackDays) : '—' },
            { text: 'Status', options: { bold: true } },
            { text: camp.status },
          ],
          [
            { text: 'Result', options: { bold: true } },
            { text: camp.resultStatus },
            { text: '', options: {} },
            { text: '' },
          ],
        ];

        // Build table rows for pptxgenjs
        const tableRows: PptxGenJS.TableRow[] = [];

        // Header row
        tableRows.push([
          { text: 'Metric', options: { fill: { color: COLORS.maroon.replace('#', '') }, color: 'FFFFFF', bold: true, fontSize: 9 } },
          { text: 'Value', options: { fill: { color: COLORS.maroon.replace('#', '') }, color: 'FFFFFF', bold: true, fontSize: 9 } },
          { text: 'Metric', options: { fill: { color: COLORS.maroon.replace('#', '') }, color: 'FFFFFF', bold: true, fontSize: 9 } },
          { text: 'Value', options: { fill: { color: COLORS.maroon.replace('#', '') }, color: 'FFFFFF', bold: true, fontSize: 9 } },
        ]);

        metricsRows.forEach((row, idx) => {
          const bgColor = idx % 2 === 0 ? 'F9F5F6' : 'FFFFFF';
          tableRows.push(
            row.map((cell) => ({
              text: cell.text,
              options: {
                fontSize: 9,
                fill: { color: bgColor },
                bold: !!(cell.options && 'bold' in cell.options && cell.options.bold),
                color: '333333',
              },
            }))
          );
        });

        slide.addTable(tableRows, {
          x: 0.5,
          y: 1.5,
          w: 9,
          colW: [2.0, 2.5, 2.0, 2.5],
          fontSize: 9,
          fontFace: 'Arial',
          border: { type: 'solid', pt: 0.5, color: 'CCCCCC' },
        });
      });
    } else {
      // Portfolio view — one slide per customer
      data.customers.forEach((cust) => {
        const slide = pptx.addSlide();

        slide.addText(cust.name, {
          x: 0.5,
          y: 0.3,
          w: 9,
          h: 0.6,
          fontSize: 20,
          fontFace: 'Arial',
          color: COLORS.maroon.replace('#', ''),
          bold: true,
        });

        slide.addText(`${cust.account}  |  ${cust.classification}`, {
          x: 0.5,
          y: 0.85,
          w: 9,
          h: 0.35,
          fontSize: 11,
          fontFace: 'Arial',
          color: '666666',
        });

        // Gold divider
        slide.addShape(pptx.ShapeType.rect, {
          x: 0.5,
          y: 1.2,
          w: 9,
          h: 0.04,
          fill: { color: COLORS.gold.replace('#', '') },
          line: { color: COLORS.gold.replace('#', ''), width: 0 },
        });

        const custRows: [string, string][] = [
          ['# Campaigns', String(cust.campaignCount)],
          ['Total Spend', fmtCurrency(cust.totalSpend)],
          ['Roshen Share', fmtCurrency(cust.roshenShare)],
          ['Distributor Share', fmtCurrency(cust.distributorShare)],
          ['Sales Before', fmtCurrency(cust.salesBefore)],
          ['Sales After', fmtCurrency(cust.salesAfter)],
          ['Uplift', fmtCurrency(cust.uplift)],
          ['ROI Total', fmtNum(cust.roiTotal)],
          ['ROI Roshen', fmtNum(cust.roiRoshen)],
          ['Spend / Sales %', fmtPct(cust.spendToSales)],
        ];

        const tableRows: PptxGenJS.TableRow[] = [];

        tableRows.push([
          { text: 'Metric', options: { fill: { color: COLORS.maroon.replace('#', '') }, color: 'FFFFFF', bold: true, fontSize: 10 } },
          { text: 'Value', options: { fill: { color: COLORS.maroon.replace('#', '') }, color: 'FFFFFF', bold: true, fontSize: 10 } },
        ]);

        custRows.forEach((row, idx) => {
          const bgColor = idx % 2 === 0 ? 'F9F5F6' : 'FFFFFF';
          tableRows.push([
            { text: row[0], options: { bold: true, fontSize: 10, fill: { color: bgColor }, color: '333333' } },
            { text: row[1], options: { fontSize: 10, fill: { color: bgColor }, color: '333333' } },
          ]);
        });

        slide.addTable(tableRows, {
          x: 1.5,
          y: 1.5,
          w: 7,
          colW: [3.0, 4.0],
          fontSize: 10,
          fontFace: 'Arial',
          border: { type: 'solid', pt: 0.5, color: 'CCCCCC' },
        });
      });
    }

    // ---- Save ------------------------------------------------------------
    pptx.writeFile({ fileName: `${baseFilename(data.date)}.pptx` }).catch((err) => {
      console.error('PPTX write failed:', err);
      alert('Failed to generate PowerPoint report. Please try again.');
    });
  } catch (err) {
    console.error('PowerPoint export failed:', err);
    alert('Failed to generate PowerPoint report. Please try again.');
  }
}
