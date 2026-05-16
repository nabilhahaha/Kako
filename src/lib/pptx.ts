import PptxGenJS from 'pptxgenjs';
import type { ExecutiveKPIs } from './types';

interface ExportInput {
  kpis: ExecutiveKPIs;
  generatedAt: Date;
  generatorName: string;
  dailyVisits: { day: string; visits: number }[];
}

const ROSHEN_RED = 'DC2626';
const SUCCESS = '10B981';
const WARNING = 'F59E0B';
const TEXT = '111827';
const SUBTLE = '6B7280';

function fmtNumber(n: number) {
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n));
}

function pctChange(curr: number, prev: number) {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

export async function exportExecutivePPTX(input: ExportInput) {
  const { kpis, generatedAt, generatorName, dailyVisits } = input;

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = 'FieldSync — Executive Summary';
  pptx.author = generatorName;

  // ───────────── Slide 1: Title ─────────────
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: 'FAFAFA' };
  titleSlide.addShape('rect', {
    x: 0,
    y: 0,
    w: '100%',
    h: 0.4,
    fill: { color: ROSHEN_RED },
    line: { color: ROSHEN_RED },
  });
  titleSlide.addText('FieldSync', {
    x: 0.5,
    y: 1.5,
    w: 12,
    h: 1,
    fontSize: 56,
    bold: true,
    color: TEXT,
    fontFace: 'Inter',
  });
  titleSlide.addText('Executive Summary — Roshen × Relia', {
    x: 0.5,
    y: 2.6,
    w: 12,
    h: 0.6,
    fontSize: 22,
    color: SUBTLE,
    fontFace: 'Inter',
  });
  titleSlide.addText(
    `Generated ${generatedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })} by ${generatorName}`,
    {
      x: 0.5,
      y: 6.5,
      w: 12,
      h: 0.4,
      fontSize: 14,
      color: SUBTLE,
      fontFace: 'Inter',
    },
  );

  // ───────────── Slide 2: KPI Grid ─────────────
  const kpiSlide = pptx.addSlide();
  kpiSlide.background = { color: 'FAFAFA' };
  kpiSlide.addText('Key Metrics — Last 30 Days', {
    x: 0.5,
    y: 0.4,
    w: 12,
    h: 0.6,
    fontSize: 26,
    bold: true,
    color: TEXT,
    fontFace: 'Inter',
  });

  const revenueDelta = pctChange(kpis.totalRevenue30d, kpis.totalRevenuePrev30d);
  const visitsDelta = pctChange(kpis.totalVisits30d, kpis.totalVisitsPrev30d);

  const cards: { title: string; value: string; delta?: number; tone?: string }[] = [
    {
      title: 'Revenue (30d)',
      value: fmtCurrency(kpis.totalRevenue30d) + ' SAR',
      delta: revenueDelta,
    },
    {
      title: 'Visits (30d)',
      value: fmtNumber(kpis.totalVisits30d),
      delta: visitsDelta,
    },
    {
      title: 'Coverage',
      value: `${kpis.coveragePercent}%`,
      tone: SUCCESS,
    },
    {
      title: 'Active Reps',
      value: fmtNumber(kpis.totalReps),
    },
    {
      title: 'Total Customers',
      value: fmtNumber(kpis.totalCustomers),
    },
    {
      title: 'Active Customers (30d)',
      value: fmtNumber(kpis.activeCustomers30d),
    },
    {
      title: 'Overdue',
      value: fmtCurrency(kpis.totalOverdue) + ' SAR',
      tone: kpis.totalOverdue > 0 ? WARNING : SUCCESS,
    },
    {
      title: 'Pending Approvals',
      value: fmtNumber(kpis.pendingApprovals),
      tone: kpis.pendingApprovals > 10 ? WARNING : SUBTLE,
    },
  ];

  const cardW = 2.9;
  const cardH = 1.6;
  const gap = 0.2;
  const startX = 0.5;
  const startY = 1.3;
  cards.forEach((c, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = startX + col * (cardW + gap);
    const y = startY + row * (cardH + gap);

    kpiSlide.addShape('roundRect', {
      x,
      y,
      w: cardW,
      h: cardH,
      fill: { color: 'FFFFFF' },
      line: { color: 'E5E7EB', width: 1 },
      rectRadius: 0.08,
    });
    kpiSlide.addText(c.title, {
      x: x + 0.2,
      y: y + 0.2,
      w: cardW - 0.4,
      h: 0.3,
      fontSize: 11,
      color: SUBTLE,
      fontFace: 'Inter',
    });
    kpiSlide.addText(c.value, {
      x: x + 0.2,
      y: y + 0.55,
      w: cardW - 0.4,
      h: 0.6,
      fontSize: 24,
      bold: true,
      color: c.tone ?? TEXT,
      fontFace: 'Inter',
    });
    if (c.delta != null) {
      const up = c.delta >= 0;
      kpiSlide.addText(`${up ? '▲' : '▼'} ${Math.abs(c.delta).toFixed(1)}% vs prev`, {
        x: x + 0.2,
        y: y + 1.2,
        w: cardW - 0.4,
        h: 0.3,
        fontSize: 11,
        color: up ? SUCCESS : ROSHEN_RED,
        fontFace: 'Inter',
      });
    }
  });

  // ───────────── Slide 3: Visit Trend ─────────────
  if (dailyVisits.length > 0) {
    const trendSlide = pptx.addSlide();
    trendSlide.background = { color: 'FAFAFA' };
    trendSlide.addText('Daily Visit Volume — Last 30 Days', {
      x: 0.5,
      y: 0.4,
      w: 12,
      h: 0.6,
      fontSize: 26,
      bold: true,
      color: TEXT,
      fontFace: 'Inter',
    });
    trendSlide.addChart(
      pptx.ChartType.line,
      [
        {
          name: 'Visits',
          labels: dailyVisits.map((d) => d.day.slice(5)),
          values: dailyVisits.map((d) => d.visits),
        },
      ],
      {
        x: 0.5,
        y: 1.3,
        w: 12,
        h: 5.5,
        chartColors: [ROSHEN_RED],
        showLegend: false,
        showTitle: false,
        catAxisLabelFontSize: 10,
        valAxisLabelFontSize: 10,
        lineDataSymbolSize: 6,
        lineSize: 2,
      },
    );
  }

  await pptx.writeFile({
    fileName: `FieldSync_Executive_${generatedAt.toISOString().slice(0, 10)}.pptx`,
  });
}
