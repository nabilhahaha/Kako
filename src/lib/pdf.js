// Visit-based PDF report (English-only, native jsPDF — no html2canvas).
// One PDF per visit, with all items in a compact table, then per-item photo
// pages.

import { ACTION_LABELS } from './actions.js';
import { db } from './db.js';

/* ─── Design tokens ──────────────────────────────────────────────────────── */
const PT = {
  pageW: 595.28,
  pageH: 841.89,
  margin: 42.52,
  gutter: 18,
  sectionGap: 18,
  rowH: 18,
};

const C = {
  primary:    [200, 16, 46],
  text:       [17, 24, 39],
  muted:      [107, 114, 128],
  border:     [229, 231, 235],
  bgSoft:     [243, 244, 246],
  bgRow:      [249, 250, 251],
  white:      [255, 255, 255],
  dCritical:  [220, 38, 38],
  dWarning:   [217, 119, 6],
  dSafe:      [22, 163, 74],
  dExpired:   [127, 29, 29],
  promo_1_1:  { bg: [207, 250, 254], fg: [14, 116, 144] },
  promo_2_1:  { bg: [237, 233, 254], fg: [109, 40, 217] },
  pull_resell:{ bg: [255, 237, 213], fg: [194, 65, 12]  },
  no_action:  { bg: [243, 244, 246], fg: [55, 65, 81]   },
};

const VISIT_STATUS = {
  draft:          { bg: [243, 244, 246], fg: [17, 24, 39],    label: 'DRAFT' },
  pending_tm:     { bg: [245, 158, 11],  fg: [255, 255, 255], label: 'PENDING TRADE MARKETING' },
  pending_roshen: { bg: [251, 191, 36],  fg: [17, 24, 39],    label: 'PENDING ROSHEN MANAGER' },
  completed:      { bg: [16, 185, 129],  fg: [255, 255, 255], label: 'COMPLETED' },
};

const ITEM_STATUS = {
  pending_tm:       { bg: [254, 243, 199], fg: [146, 64, 14],   label: 'Pending TM' },
  pending_roshen:   { bg: [219, 234, 254], fg: [30, 64, 175],   label: 'Pending RM' },
  approved:         { bg: [220, 252, 231], fg: [22, 101, 52],   label: 'Approved' },
  closed_no_action: { bg: [243, 244, 246], fg: [55, 65, 81],    label: 'Closed' },
};

/* ─── Low-level helpers ──────────────────────────────────────────────────── */
const fillRect = (pdf, x, y, w, h, color) => {
  pdf.setFillColor(...color);
  pdf.rect(x, y, w, h, 'F');
};
const strokeRect = (pdf, x, y, w, h, color, weight = 0.5) => {
  pdf.setDrawColor(...color);
  pdf.setLineWidth(weight);
  pdf.rect(x, y, w, h, 'S');
};
const setText = (pdf, color, size, style = 'normal') => {
  pdf.setTextColor(...color);
  pdf.setFontSize(size);
  pdf.setFont('helvetica', style);
};
const lighten = (rgb, alpha = 0.18) => [
  Math.round(rgb[0] * alpha + 255 * (1 - alpha)),
  Math.round(rgb[1] * alpha + 255 * (1 - alpha)),
  Math.round(rgb[2] * alpha + 255 * (1 - alpha)),
];
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return (
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  );
};
const dayColor = (days) => {
  if (days < 0) return C.dExpired;
  if (days <= 30) return C.dCritical;
  if (days <= 60) return C.dWarning;
  return C.dSafe;
};
const actionLabel = (code) => (code && ACTION_LABELS[code] ? ACTION_LABELS[code].en : '—');

/* ─── Image fetching ─────────────────────────────────────────────────────── */
const fetchAsDataUrl = async (url) => {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

const loadImage = (dataUrl) =>
  new Promise((resolve, reject) => {
    if (!dataUrl) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });

/* ─── Building blocks ────────────────────────────────────────────────────── */
const drawHeader = (pdf, visit) => {
  const { margin, pageW } = PT;
  const top = margin;
  fillRect(pdf, margin, top, 42, 42, C.primary);
  setText(pdf, C.white, 22, 'bold');
  pdf.text('R', margin + 21, top + 28, { align: 'center' });

  setText(pdf, C.primary, 12, 'bold');
  pdf.text('ROSHEN KSA', margin + 52, top + 18);
  setText(pdf, C.muted, 9, 'normal');
  pdf.text('× Relia Distribution', margin + 52, top + 32);

  setText(pdf, C.text, 18, 'bold');
  pdf.text('Visit Report — Near Expiry', pageW - margin, top + 18, { align: 'right' });
  setText(pdf, C.muted, 9, 'normal');
  pdf.text(`Visit #${visit.id.slice(-6).toUpperCase()}`, pageW - margin, top + 32, { align: 'right' });
  pdf.text(`Generated: ${fmtDateTime(new Date().toISOString())}`, pageW - margin, top + 44, { align: 'right' });

  const dividerY = top + 56;
  pdf.setDrawColor(...C.primary);
  pdf.setLineWidth(1.5);
  pdf.line(margin, dividerY, pageW - margin, dividerY);

  return dividerY + 14;
};

const drawStatusBadge = (pdf, y, status) => {
  const { margin, pageW } = PT;
  const meta = VISIT_STATUS[status] || VISIT_STATUS.pending_tm;
  const w = pageW - 2 * margin;
  const h = 26;
  pdf.setFillColor(...meta.bg);
  pdf.roundedRect(margin, y, w, h, 4, 4, 'F');
  setText(pdf, meta.fg, 11, 'bold');
  pdf.text(meta.label, pageW / 2, y + 17, { align: 'center' });
  return y + h + PT.sectionGap;
};

const drawSectionHeader = (pdf, y, title) => {
  const { margin, pageW } = PT;
  const w = pageW - 2 * margin;
  const h = 20;
  fillRect(pdf, margin, y, w, h, C.bgSoft);
  fillRect(pdf, margin, y, 4, h, C.primary);
  setText(pdf, C.text, 11, 'bold');
  pdf.text(title.toUpperCase(), margin + 12, y + 14);
  return y + h;
};

const drawKvRows = (pdf, startY, rows) => {
  const { margin, pageW, rowH } = PT;
  const w = pageW - 2 * margin;
  const labelX = margin + 12;
  const valueX = margin + 150;
  let y = startY;
  rows.forEach((row, i) => {
    if (i % 2 === 0) fillRect(pdf, margin, y, w, rowH, C.bgRow);
    strokeRect(pdf, margin, y, w, rowH, C.border, 0.25);
    setText(pdf, C.muted, 9, 'bold');
    pdf.text(row.label, labelX, y + 12);
    setText(pdf, C.text, 10, 'normal');
    pdf.text(String(row.value ?? '—'), valueX, y + 12, { maxWidth: w - 150 - 12 });
    y += rowH;
  });
  return y + 4;
};

const drawFooter = (pdf, pageNumber, totalPages) => {
  const { margin, pageW, pageH } = PT;
  const y = pageH - margin / 2 - 8;
  pdf.setDrawColor(...C.border);
  pdf.setLineWidth(0.5);
  pdf.line(margin, y - 10, pageW - margin, y - 10);
  setText(pdf, C.muted, 8, 'normal');
  pdf.text('Generated from Near Expiry Registration System · Roshen KSA × Relia Distribution', margin, y);
  pdf.text(`Page ${pageNumber} of ${totalPages}`, pageW - margin, y, { align: 'right' });
};

const ensureRoom = (pdf, cursorY, needed) => {
  if (cursorY + needed <= PT.pageH - PT.margin - 28) return cursorY;
  pdf.addPage();
  return PT.margin;
};

/* ─── Items table ────────────────────────────────────────────────────────── */
//
// Compact table with one row per item:
//   #  | Item description / SKU | Qty (sys/phys) | Days  | Suggest | TM | RM | Status
//
const ITEM_COL_W = [22, 200, 60, 50, 60, 50, 50, 0]; // last col fills remaining
const ITEM_HEADERS = ['#', 'Item / SKU', 'Qty', 'Days', 'Suggest', 'TM', 'RM', 'Status'];

const layoutColumns = () => {
  const usableW = PT.pageW - 2 * PT.margin;
  const reserved = ITEM_COL_W.reduce((s, w) => s + w, 0);
  const last = usableW - reserved;
  return ITEM_COL_W.map((w, i) => (i === ITEM_COL_W.length - 1 ? last : w));
};

const drawItemsTableHeader = (pdf, y) => {
  const { margin, pageW } = PT;
  const w = pageW - 2 * margin;
  const h = 22;
  const widths = layoutColumns();
  fillRect(pdf, margin, y, w, h, C.primary);
  setText(pdf, C.white, 9, 'bold');
  let x = margin + 6;
  ITEM_HEADERS.forEach((label, i) => {
    pdf.text(label, x, y + 14);
    x += widths[i];
  });
  return y + h;
};

const drawItemRow = (pdf, y, index, item, widths) => {
  const { margin, pageW } = PT;
  const w = pageW - 2 * margin;
  const baseH = 28;

  if (index % 2 === 0) fillRect(pdf, margin, y, w, baseH, C.bgRow);
  strokeRect(pdf, margin, y, w, baseH, C.border, 0.25);

  let x = margin + 6;

  // #
  setText(pdf, C.muted, 9, 'bold');
  pdf.text(String(index + 1), x, y + 17);
  x += widths[0];

  // Item description (wrap to two lines) + SKU
  setText(pdf, C.text, 9, 'bold');
  const descLines = pdf.splitTextToSize(item.itemDesc, widths[1] - 6);
  pdf.text(descLines.slice(0, 2), x, y + 11);
  setText(pdf, C.muted, 8, 'normal');
  pdf.text(item.itemId, x, y + 25);
  x += widths[1];

  // Qty
  setText(pdf, C.text, 9, 'normal');
  pdf.text(`${item.netQty}/${item.physQty}`, x, y + 17);
  x += widths[2];

  // Days
  const dCol = dayColor(item.daysRemaining);
  setText(pdf, dCol, 9, 'bold');
  pdf.text(String(item.daysRemaining), x, y + 17);
  x += widths[3];

  // Suggest
  setText(pdf, (C[item.salesmanSuggestion] || C.no_action).fg, 8, 'bold');
  pdf.text(actionLabel(item.salesmanSuggestion).slice(0, 12), x, y + 17);
  x += widths[4];

  // TM
  setText(pdf, item.tmDecision ? (C[item.tmDecision] || C.no_action).fg : C.muted, 8, 'bold');
  pdf.text(item.tmDecision ? actionLabel(item.tmDecision).slice(0, 12) : '—', x, y + 17);
  x += widths[5];

  // RM
  setText(pdf, item.roshenDecision ? (C[item.roshenDecision] || C.no_action).fg : C.muted, 8, 'bold');
  pdf.text(item.roshenDecision ? actionLabel(item.roshenDecision).slice(0, 12) : '—', x, y + 17);
  x += widths[6];

  // Status pill
  const stat = ITEM_STATUS[item.itemStatus] || ITEM_STATUS.pending_tm;
  setText(pdf, stat.fg, 8, 'bold');
  pdf.text(stat.label, x, y + 17);

  return y + baseH;
};

const drawItemsTable = (pdf, startY, items) => {
  let y = startY;
  y = drawSectionHeader(pdf, y, `Items (${items.length})`);
  y = drawItemsTableHeader(pdf, y);
  const widths = layoutColumns();
  items.forEach((it, i) => {
    y = ensureRoom(pdf, y, 32);
    y = drawItemRow(pdf, y, i, it, widths);
  });
  return y + PT.sectionGap;
};

const drawItemNotesSection = (pdf, startY, items) => {
  const withNotes = items.filter(
    (it) => it.salesmanNotes || it.tmNotes || it.roshenNotes,
  );
  if (withNotes.length === 0) return startY;
  let y = startY;
  y = ensureRoom(pdf, y, 60);
  y = drawSectionHeader(pdf, y, 'Item notes & decision details');
  withNotes.forEach((it, i) => {
    y = ensureRoom(pdf, y, 70);
    setText(pdf, C.text, 10, 'bold');
    pdf.text(`${i + 1}. ${it.itemDesc}`, PT.margin + 8, y + 12);
    y += 16;

    const writeBlock = (label, content, color) => {
      if (!content) return;
      const lines = pdf.splitTextToSize(content, PT.pageW - 2 * PT.margin - 24);
      const h = lines.length * 11 + 14;
      y = ensureRoom(pdf, y, h);
      pdf.setFillColor(...lighten(color, 0.18));
      pdf.rect(PT.margin + 12, y, PT.pageW - 2 * PT.margin - 12, h, 'F');
      setText(pdf, color, 8, 'bold');
      pdf.text(label, PT.margin + 18, y + 10);
      setText(pdf, C.text, 9, 'normal');
      pdf.text(lines, PT.margin + 18, y + 22);
      y += h + 4;
    };

    writeBlock('🟦 SALESMAN', it.salesmanNotes, [37, 99, 235]);
    writeBlock('🟨 TRADE MARKETING', it.tmNotes,    [217, 119, 6]);
    writeBlock('🟩 ROSHEN MANAGER', it.roshenNotes, [22, 163, 74]);

    y += 4;
  });
  return y;
};

/* ─── Photo pages ────────────────────────────────────────────────────────── */
const drawPhotoPages = (pdf, visit, itemsWithPhotos) => {
  if (itemsWithPhotos.length === 0) return;
  const { margin, pageW, pageH } = PT;

  itemsWithPhotos.forEach((entry, idx) => {
    pdf.addPage();
    let y = margin;
    setText(pdf, C.primary, 14, 'bold');
    pdf.text(`Photos — Item ${idx + 1} of ${itemsWithPhotos.length}`, margin, y + 12);
    setText(pdf, C.muted, 9, 'normal');
    pdf.text(`Visit #${visit.id.slice(-6).toUpperCase()}`, pageW - margin, y + 12, { align: 'right' });
    y += 22;
    pdf.setDrawColor(...C.border);
    pdf.setLineWidth(0.5);
    pdf.line(margin, y, pageW - margin, y);
    y += 16;

    setText(pdf, C.text, 11, 'bold');
    pdf.text(entry.item.itemDesc, margin, y + 12);
    setText(pdf, C.muted, 9, 'normal');
    pdf.text(`SKU: ${entry.item.itemId}`, margin, y + 26);
    y += 36;

    const photos = [
      { img: entry.expiry, caption: 'Photo 1 — Expiry date' },
      { img: entry.qty,    caption: 'Photo 2 — Total stock quantity' },
    ].filter((p) => p.img);

    const availableW = pageW - 2 * margin;
    const maxImgH = (pageH - y - margin - 60) / Math.max(1, photos.length) - 22;

    photos.forEach((p) => {
      setText(pdf, C.text, 10, 'bold');
      pdf.text(p.caption, margin, y + 12);
      y += 18;
      const img = p.img;
      const ratio = img.naturalWidth / img.naturalHeight;
      let w = availableW;
      let h = w / ratio;
      if (h > maxImgH) {
        h = maxImgH;
        w = h * ratio;
      }
      const x = margin + (availableW - w) / 2;
      fillRect(pdf, x - 2, y - 2, w + 4, h + 4, C.border);
      pdf.addImage(img, 'JPEG', x, y, w, h, undefined, 'FAST');
      y += h + PT.gutter;
    });
  });
};

/* ─── Entry point ────────────────────────────────────────────────────────── */
export const generateVisitPdf = async (visit, items) => {
  // Resolve all photos (per item) in parallel.
  const itemPhotos = await Promise.all(
    items.map(async (it) => {
      const [eUrl, qUrl] = await Promise.all([
        it.photoExpiryPath ? db.getPhotoUrl(it.photoExpiryPath) : null,
        it.photoQtyPath ? db.getPhotoUrl(it.photoQtyPath) : null,
      ]);
      const [eData, qData] = await Promise.all([
        fetchAsDataUrl(eUrl),
        fetchAsDataUrl(qUrl),
      ]);
      const [eImg, qImg] = await Promise.all([
        loadImage(eData).catch(() => null),
        loadImage(qData).catch(() => null),
      ]);
      return { item: it, expiry: eImg, qty: qImg };
    }),
  );

  const { default: jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  // ─── Page 1: header + visit info + items table + per-item notes ───
  let y = drawHeader(pdf, visit);
  y = drawStatusBadge(pdf, y, visit.status);

  y = drawSectionHeader(pdf, y, 'Visit Information');
  y = drawKvRows(pdf, y, [
    { label: 'Salesman',         value: visit.salesmanName },
    { label: 'Customer',         value: visit.custName },
    { label: 'Customer account', value: visit.custAccount },
    { label: 'Visit date',       value: fmtDate(visit.visitDate) },
    { label: 'Submitted at',     value: visit.submittedAt ? fmtDateTime(visit.submittedAt) : '—' },
    { label: 'Total items',      value: String(items.length) },
  ]);
  if (visit.notes) {
    y = ensureRoom(pdf, y, 40);
    setText(pdf, C.muted, 9, 'bold');
    pdf.text('Visit notes', PT.margin + 12, y + 12);
    y += 14;
    const lines = pdf.splitTextToSize(visit.notes, PT.pageW - 2 * PT.margin - 24);
    setText(pdf, C.text, 9, 'normal');
    const boxH = lines.length * 11 + 12;
    strokeRect(pdf, PT.margin, y, PT.pageW - 2 * PT.margin, boxH, C.border);
    pdf.text(lines, PT.margin + 12, y + 12);
    y += boxH + 6;
  }
  y += 6;

  y = ensureRoom(pdf, y, 80);
  y = drawItemsTable(pdf, y, items);
  y = drawItemNotesSection(pdf, y, items);

  // ─── Photo pages (one per item with at least one photo) ───
  const photoEntries = itemPhotos.filter((e) => e.expiry || e.qty);
  drawPhotoPages(pdf, visit, photoEntries);

  // Footer on every page.
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    drawFooter(pdf, i, total);
  }

  const dateSlug = new Date().toISOString().slice(0, 10);
  const shortId = visit.id.slice(-6);
  pdf.save(`near-expiry-visit-${shortId}-${dateSlug}.pdf`);
};
