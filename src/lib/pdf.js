// Visit-based PDF report (English-only, native jsPDF — no html2canvas).
// One PDF per visit, with all items in a compact table, then per-item photo
// pages. Strictly latin-1 text — Helvetica doesn't ship glyphs for emojis or
// most punctuation outside Windows-1252.

import { ACTION_LABELS } from './actions.js';
import { db } from './db.js';

/* ─── Design tokens ──────────────────────────────────────────────────────── */
const PT = {
  pageW: 595.28,
  pageH: 841.89,
  margin: 30,                // tighter to give the items table more room
  gutter: 18,
  sectionGap: 18,
};

const C = {
  primary:    [185, 28, 28],     // softer corporate red (#b91c1c)
  text:       [17, 24, 39],
  muted:      [107, 114, 128],
  border:     [229, 231, 235],
  bgSoft:     [243, 244, 246],
  bgRow:      [249, 250, 251],
  white:      [255, 255, 255],
  dCritical:  [185, 28, 28],
  dWarning:   [180, 83, 9],
  dSafe:      [21, 128, 61],
  dExpired:   [127, 29, 29],
  blueNote:   [30, 64, 175],
  amberNote:  [146, 64, 14],
  greenNote:  [22, 101, 52],
  // Action pill colours (subdued)
  promo_1_1:  { bg: [207, 250, 254], fg: [14, 116, 144] },
  promo_2_1:  { bg: [237, 233, 254], fg: [109, 40, 217] },
  pull_resell:{ bg: [255, 237, 213], fg: [180, 83, 9]   },
  no_action:  { bg: [243, 244, 246], fg: [55, 65, 81]   },
};

const VISIT_STATUS = {
  draft:          { bg: [243, 244, 246], fg: [17, 24, 39],    label: 'DRAFT' },
  pending_tm:     { bg: [196, 65, 12],   fg: [255, 255, 255], label: 'PENDING TRADE MARKETING' },
  pending_roshen: { bg: [180, 83, 9],    fg: [255, 255, 255], label: 'PENDING ROSHEN MANAGER' },
  completed:      { bg: [21, 128, 61],   fg: [255, 255, 255], label: 'APPROVED' },
};

const ITEM_STATUS = {
  pending_tm:       { bg: [254, 215, 170], fg: [124, 45, 18],   label: 'Pending TM' },
  pending_roshen:   { bg: [254, 240, 138], fg: [113, 63, 18],   label: 'Pending RM' },
  approved:         { bg: [187, 247, 208], fg: [20, 83, 45],    label: 'Approved' },
  closed_no_action: { bg: [229, 231, 235], fg: [55, 65, 81],    label: 'Closed' },
};

// Compact action labels for the items table — full labels overflow narrow cells.
const ACTION_SHORT = {
  promo_1_1:   '1+1 Promo',
  promo_2_1:   '2+1 Promo',
  pull_resell: 'Pull/resell',
  no_action:   'No action',
};

/* ─── Latin-1 safety net ─────────────────────────────────────────────────── */
// Helvetica only ships glyphs for the WinAnsi/Latin-1 range, so anything else
// (emoji, em-dash, smart quotes, Arabic) prints as garbage. We strip or
// transliterate before drawing.
const LATIN_SAFE_MAP = {
  '—': '-',  '–': '-',          // em / en dash
  '‘': "'",  '’': "'",          // curly single quotes
  '“': '"',  '”': '"',          // curly double quotes
  '…': '...', ' ': ' ',         // ellipsis, nbsp
  '•': '*',                          // bullet
};

const safeText = (s) => {
  if (s === null || s === undefined) return '';
  let str = String(s);
  // Map known typographic chars.
  str = str.replace(/[—–‘’“”… •]/g, (c) => LATIN_SAFE_MAP[c] || '');
  // Drop anything outside the BMP (emojis, etc.) and anything above U+00FF.
  // eslint-disable-next-line no-control-regex
  str = str.replace(/[^\x00-\xFF]/g, '');
  return str.trim();
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
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
const drawText = (pdf, str, x, y, opts = {}) => {
  pdf.text(safeText(str), x, y, opts);
};
const lighten = (rgb, alpha = 0.18) => [
  Math.round(rgb[0] * alpha + 255 * (1 - alpha)),
  Math.round(rgb[1] * alpha + 255 * (1 - alpha)),
  Math.round(rgb[2] * alpha + 255 * (1 - alpha)),
];

const fmtDate = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtDateTime = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return (
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    '  ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  );
};

const dayColor = (days) => {
  if (days < 0) return C.dExpired;
  if (days <= 30) return C.dCritical;
  if (days <= 60) return C.dWarning;
  return C.dSafe;
};

const actionFull  = (code) => (code && ACTION_LABELS[code] ? ACTION_LABELS[code].en : '-');
const actionShort = (code) => (code && ACTION_SHORT[code]  ? ACTION_SHORT[code]     : '-');

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
  drawText(pdf, 'R', margin + 21, top + 28, { align: 'center' });

  setText(pdf, C.primary, 12, 'bold');
  drawText(pdf, 'ROSHEN KSA', margin + 52, top + 18);
  setText(pdf, C.muted, 9, 'normal');
  drawText(pdf, 'x Relia Distribution', margin + 52, top + 32);

  setText(pdf, C.text, 17, 'bold');
  drawText(pdf, 'Visit Report - Near Expiry', pageW - margin, top + 18, { align: 'right' });
  setText(pdf, C.muted, 9, 'normal');
  drawText(pdf, `Visit #${visit.id.slice(-6).toUpperCase()}`, pageW - margin, top + 32, { align: 'right' });
  drawText(pdf, `Generated: ${fmtDateTime(new Date().toISOString())}`, pageW - margin, top + 44, { align: 'right' });

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
  drawText(pdf, meta.label, pageW / 2, y + 17, { align: 'center' });
  return y + h + PT.sectionGap;
};

const drawSectionHeader = (pdf, y, title) => {
  const { margin, pageW } = PT;
  const w = pageW - 2 * margin;
  const h = 20;
  fillRect(pdf, margin, y, w, h, C.bgSoft);
  fillRect(pdf, margin, y, 4, h, C.primary);
  setText(pdf, C.text, 11, 'bold');
  drawText(pdf, title.toUpperCase(), margin + 12, y + 14);
  return y + h;
};

const drawKvRows = (pdf, startY, rows) => {
  const { margin, pageW } = PT;
  const w = pageW - 2 * margin;
  const labelX = margin + 12;
  const valueX = margin + 150;
  const rowH = 18;
  let y = startY;
  rows.forEach((row, i) => {
    if (i % 2 === 0) fillRect(pdf, margin, y, w, rowH, C.bgRow);
    strokeRect(pdf, margin, y, w, rowH, C.border, 0.25);
    setText(pdf, C.muted, 9, 'bold');
    drawText(pdf, row.label, labelX, y + 12);
    setText(pdf, C.text, 10, 'normal');
    drawText(pdf, String(row.value ?? '-'), valueX, y + 12, { maxWidth: w - 150 - 12 });
    y += rowH;
  });
  return y + 4;
};

const drawFooter = (pdf, pageNumber, totalPages) => {
  const { margin, pageW, pageH } = PT;
  const y = pageH - 18;
  pdf.setDrawColor(...C.border);
  pdf.setLineWidth(0.5);
  pdf.line(margin, y - 10, pageW - margin, y - 10);
  setText(pdf, C.muted, 8, 'normal');
  drawText(pdf, 'Generated from Near Expiry Registration System  -  Roshen KSA x Relia Distribution', margin, y);
  drawText(pdf, `Page ${pageNumber} of ${totalPages}`, pageW - margin, y, { align: 'right' });
};

const ensureRoom = (pdf, cursorY, needed) => {
  if (cursorY + needed <= PT.pageH - PT.margin - 28) return cursorY;
  pdf.addPage();
  return PT.margin;
};

/* ─── Items table ────────────────────────────────────────────────────────── */
//
// Portrait-page column layout. Sum = pageW - 2*margin = 535pt.
//
//        #    Item/SKU   Qty   Days  Suggest    TM      RM     Status
//   widths: 18   165     42    28      78      70      70      64
//
const COL = { idx: 18, item: 165, qty: 42, days: 28, suggest: 78, tm: 70, rm: 70, status: 64 };
const ITEM_HEADERS = ['#', 'Item / SKU', 'Qty (sys/phys)', 'Days', 'Suggest', 'TM', 'RM', 'Status'];

const colWidths = () => [COL.idx, COL.item, COL.qty, COL.days, COL.suggest, COL.tm, COL.rm, COL.status];

const drawItemsTableHeader = (pdf, y) => {
  const { margin } = PT;
  const widths = colWidths();
  const totalW = widths.reduce((a, b) => a + b, 0);
  const h = 22;
  fillRect(pdf, margin, y, totalW, h, C.primary);
  setText(pdf, C.white, 8.5, 'bold');
  let x = margin + 4;
  ITEM_HEADERS.forEach((label, i) => {
    drawText(pdf, label, x, y + 14);
    x += widths[i];
  });
  return y + h;
};

// Pull text into at most `maxLines` and add an ellipsis if truncated.
const cap = (pdf, text, widthPt, maxLines = 2) => {
  const lines = pdf.splitTextToSize(safeText(text), widthPt);
  if (lines.length <= maxLines) return lines;
  const out = lines.slice(0, maxLines);
  out[maxLines - 1] = out[maxLines - 1].replace(/\s*\S{0,3}$/, '') + '...';
  return out;
};

const drawItemRow = (pdf, y, index, item) => {
  const { margin } = PT;
  const widths = colWidths();
  const totalW = widths.reduce((a, b) => a + b, 0);

  // Compute row height from the wrapped description.
  setText(pdf, C.text, 8.5, 'bold');
  const descLines = cap(pdf, item.itemDesc, widths[1] - 8, 2);
  const descH = descLines.length * 10;
  const rowH = Math.max(30, descH + 16); // desc + 4pt gap + 12pt SKU/font row

  if (index % 2 === 0) fillRect(pdf, margin, y, totalW, rowH, C.bgRow);
  strokeRect(pdf, margin, y, totalW, rowH, C.border, 0.25);

  let x = margin + 4;

  // # (vertically centred)
  setText(pdf, C.muted, 9, 'bold');
  drawText(pdf, String(index + 1), x, y + rowH / 2 + 3);
  x += widths[0];

  // Item description (top) + SKU (below, smaller, gray)
  setText(pdf, C.text, 8.5, 'bold');
  let lineY = y + 10;
  descLines.forEach((ln) => {
    drawText(pdf, ln, x, lineY);
    lineY += 10;
  });
  setText(pdf, C.muted, 7.5, 'normal');
  drawText(pdf, item.itemId, x, lineY + 4);
  x += widths[1];

  // Vertically-centred baseline for the remaining single-line columns.
  const midY = y + rowH / 2 + 3;

  // Qty
  setText(pdf, C.text, 8.5, 'normal');
  drawText(pdf, `${item.netQty} / ${item.physQty}`, x, midY);
  x += widths[2];

  // Days (coloured)
  const dCol = dayColor(item.daysRemaining);
  setText(pdf, dCol, 9, 'bold');
  drawText(pdf, String(item.daysRemaining), x, midY);
  x += widths[3];

  // Suggest (compact label, ellipsis if narrow)
  const suggestColors = (C[item.salesmanSuggestion] || C.no_action);
  setText(pdf, suggestColors.fg, 8, 'bold');
  const suggestText = item.salesmanSuggestion ? actionShort(item.salesmanSuggestion) : '-';
  const suggestLines = cap(pdf, suggestText, widths[4] - 6, 1);
  drawText(pdf, suggestLines[0], x, midY);
  x += widths[4];

  // TM
  const tmColors = item.tmDecision ? (C[item.tmDecision] || C.no_action) : { fg: C.muted };
  setText(pdf, tmColors.fg, 8, 'bold');
  const tmText = item.tmDecision ? actionShort(item.tmDecision) : '-';
  drawText(pdf, cap(pdf, tmText, widths[5] - 6, 1)[0], x, midY);
  x += widths[5];

  // RM
  const rmColors = item.roshenDecision ? (C[item.roshenDecision] || C.no_action) : { fg: C.muted };
  setText(pdf, rmColors.fg, 8, 'bold');
  const rmText = item.roshenDecision ? actionShort(item.roshenDecision) : '-';
  drawText(pdf, cap(pdf, rmText, widths[6] - 6, 1)[0], x, midY);
  x += widths[6];

  // Status pill (sized to fit text + 8pt padding inside the column)
  const stat = ITEM_STATUS[item.itemStatus] || ITEM_STATUS.pending_tm;
  setText(pdf, stat.fg, 8, 'bold');
  const labelW = pdf.getTextWidth(safeText(stat.label));
  const pillW = Math.min(widths[7] - 6, labelW + 12);
  const pillH = 14;
  const pillX = x + (widths[7] - pillW) / 2;
  const pillY = midY - 10;
  pdf.setFillColor(...stat.bg);
  pdf.roundedRect(pillX, pillY, pillW, pillH, 7, 7, 'F');
  drawText(pdf, stat.label, pillX + pillW / 2, midY, { align: 'center' });

  return y + rowH;
};

const drawItemsTable = (pdf, startY, items) => {
  let y = startY;
  y = drawSectionHeader(pdf, y, `Items (${items.length})`);
  y = drawItemsTableHeader(pdf, y);
  items.forEach((it, i) => {
    y = ensureRoom(pdf, y, 36);
    y = drawItemRow(pdf, y, i, it);
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
    drawText(pdf, `${i + 1}. ${it.itemDesc}`, PT.margin + 8, y + 12);
    setText(pdf, C.muted, 8, 'normal');
    drawText(pdf, `SKU: ${it.itemId}`, PT.margin + 8, y + 24);
    y += 30;

    const writeBlock = (label, content, color) => {
      if (!content) return;
      const lines = pdf.splitTextToSize(safeText(content), PT.pageW - 2 * PT.margin - 24);
      const h = lines.length * 11 + 18;
      y = ensureRoom(pdf, y, h);
      pdf.setFillColor(...lighten(color, 0.18));
      pdf.rect(PT.margin + 12, y, PT.pageW - 2 * PT.margin - 12, h, 'F');
      setText(pdf, color, 8.5, 'bold');
      drawText(pdf, label, PT.margin + 18, y + 11);
      setText(pdf, C.text, 9, 'normal');
      pdf.text(lines, PT.margin + 18, y + 23);
      y += h + 4;
    };

    writeBlock('SALESMAN NOTE',         it.salesmanNotes, C.blueNote);
    writeBlock('TRADE MARKETING NOTE',  it.tmNotes,       C.amberNote);
    writeBlock('ROSHEN MANAGER NOTE',   it.roshenNotes,   C.greenNote);

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
    drawText(pdf, `Photos - Item ${idx + 1} of ${itemsWithPhotos.length}`, margin, y + 12);
    setText(pdf, C.muted, 9, 'normal');
    drawText(pdf, `Visit #${visit.id.slice(-6).toUpperCase()}`, pageW - margin, y + 12, { align: 'right' });
    y += 22;
    pdf.setDrawColor(...C.border);
    pdf.setLineWidth(0.5);
    pdf.line(margin, y, pageW - margin, y);
    y += 16;

    setText(pdf, C.text, 11, 'bold');
    drawText(pdf, entry.item.itemDesc, margin, y + 12);
    setText(pdf, C.muted, 9, 'normal');
    drawText(pdf, `SKU: ${entry.item.itemId}`, margin, y + 26);
    y += 36;

    const photos = [
      { img: entry.expiry, caption: 'Photo 1 - Expiry date' },
      { img: entry.qty,    caption: 'Photo 2 - Total stock quantity' },
    ].filter((p) => p.img);

    const availableW = pageW - 2 * margin;
    const maxImgH = (pageH - y - margin - 60) / Math.max(1, photos.length) - 22;

    photos.forEach((p) => {
      setText(pdf, C.text, 10, 'bold');
      drawText(pdf, p.caption, margin, y + 12);
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

  // Page 1: header + status + visit info + items table + notes
  let y = drawHeader(pdf, visit);
  y = drawStatusBadge(pdf, y, visit.status);

  y = drawSectionHeader(pdf, y, 'Visit Information');
  y = drawKvRows(pdf, y, [
    { label: 'Salesman',         value: visit.salesmanName },
    { label: 'Customer',         value: visit.custName },
    { label: 'Customer account', value: visit.custAccount },
    { label: 'Visit date',       value: fmtDate(visit.visitDate) },
    { label: 'Submitted at',     value: visit.submittedAt ? fmtDateTime(visit.submittedAt) : '-' },
    { label: 'Total items',      value: String(items.length) },
  ]);
  if (visit.notes) {
    y = ensureRoom(pdf, y, 40);
    setText(pdf, C.muted, 9, 'bold');
    drawText(pdf, 'Visit notes', PT.margin + 12, y + 12);
    y += 14;
    const lines = pdf.splitTextToSize(safeText(visit.notes), PT.pageW - 2 * PT.margin - 24);
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
