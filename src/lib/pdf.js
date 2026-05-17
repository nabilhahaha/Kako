// PDF report generator — English-only, native jsPDF rendering (no html2canvas).
//
// Layout: A4 portrait. Real text (searchable, selectable). Sections render as
// header bar + two-column key/value table. Photos go on their own page(s).

import { ACTION_LABELS } from './actions.js';
import { db } from './db.js';

/* ─── Design tokens ──────────────────────────────────────────────────────── */
const PT = {
  pageW: 595.28,
  pageH: 841.89,
  margin: 42.52,         // ~15 mm
  gutter: 18,
  sectionGap: 18,
  rowH: 18,
};

const C = {
  primary:    [200, 16, 46],     // #C8102E — Roshen red
  text:       [17, 24, 39],      // #111827
  muted:      [107, 114, 128],   // #6B7280
  border:     [229, 231, 235],   // #E5E7EB
  bgSoft:     [243, 244, 246],   // #F3F4F6 — header bar bg
  bgRow:      [249, 250, 251],   // #F9FAFB — alt row bg
  white:      [255, 255, 255],
  // Day-remaining tones
  dCritical:  [220, 38, 38],     // ≤30
  dWarning:   [217, 119, 6],     // ≤60
  dSafe:      [22, 163, 74],     // >60
  dExpired:   [127, 29, 29],     // negative
  // Action pills (background, text)
  promo_1_1:  { bg: [207, 250, 254], fg: [14, 116, 144] },   // cyan
  promo_2_1:  { bg: [237, 233, 254], fg: [109, 40, 217] },   // purple
  pull_resell:{ bg: [255, 237, 213], fg: [194, 65, 12]  },   // orange
  no_action:  { bg: [243, 244, 246], fg: [55, 65, 81]   },   // gray
};

const STATUS = {
  approved:         { bg: [16, 185, 129],  fg: [255, 255, 255], label: 'STATUS: APPROVED' },
  pending_tm:       { bg: [245, 158, 11],  fg: [255, 255, 255], label: 'STATUS: PENDING TRADE MARKETING' },
  pending_roshen:   { bg: [251, 191, 36],  fg: [17, 24, 39],    label: 'STATUS: PENDING ROSHEN MANAGER' },
  closed_no_action: { bg: [107, 114, 128], fg: [255, 255, 255], label: 'STATUS: CLOSED — NO ACTION' },
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

const lighten = (rgb, alpha = 0.15) => [
  Math.round(rgb[0] * alpha + 255 * (1 - alpha)),
  Math.round(rgb[1] * alpha + 255 * (1 - alpha)),
  Math.round(rgb[2] * alpha + 255 * (1 - alpha)),
];

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
const drawHeader = (pdf, submission) => {
  const { margin, pageW } = PT;
  const top = margin;

  // ROSHEN red mark on the left.
  fillRect(pdf, margin, top, 42, 42, C.primary);
  setText(pdf, C.white, 22, 'bold');
  pdf.text('R', margin + 21, top + 28, { align: 'center' });

  // Brand text next to the mark.
  setText(pdf, C.primary, 12, 'bold');
  pdf.text('ROSHEN KSA', margin + 52, top + 18);
  setText(pdf, C.muted, 9, 'normal');
  pdf.text('× Relia Distribution', margin + 52, top + 32);

  // Title block on the right.
  setText(pdf, C.text, 18, 'bold');
  pdf.text('Near Expiry Registration Report', pageW - margin, top + 18, { align: 'right' });
  setText(pdf, C.muted, 9, 'normal');
  pdf.text(`Submission #${submission.id.slice(-6).toUpperCase()}`, pageW - margin, top + 32, { align: 'right' });
  pdf.text(`Generated: ${fmtDateTime(new Date().toISOString())}`, pageW - margin, top + 44, { align: 'right' });

  // Horizontal divider below the header.
  const dividerY = top + 56;
  pdf.setDrawColor(...C.primary);
  pdf.setLineWidth(1.5);
  pdf.line(margin, dividerY, pageW - margin, dividerY);

  return dividerY + 14;
};

const drawStatusBadge = (pdf, y, status) => {
  const { margin, pageW } = PT;
  const meta = STATUS[status] || STATUS.pending_tm;
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
  // accent stripe
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

    if (row.value && typeof row.value === 'object' && row.value.pill) {
      const { text, bg, fg } = row.value.pill;
      // Set font BEFORE measuring so getTextWidth reflects the size we'll draw.
      setText(pdf, fg, 9, 'bold');
      const textW = pdf.getTextWidth(text) + 14;
      const padY = 3;
      pdf.setFillColor(...bg);
      pdf.roundedRect(valueX, y + padY, textW, rowH - padY * 2, 6, 6, 'F');
      pdf.text(text, valueX + textW / 2, y + 13, { align: 'center' });
    } else {
      setText(pdf, C.text, 10, 'normal');
      pdf.text(String(row.value ?? '—'), valueX, y + 12, { maxWidth: w - 150 - 12 });
    }
    y += rowH;
  });

  return y + 4;
};

const drawNotesBox = (pdf, y, label, text) => {
  if (!text) return y;
  const { margin, pageW } = PT;
  const w = pageW - 2 * margin;
  setText(pdf, C.muted, 9, 'bold');
  pdf.text(label, margin + 12, y + 12);
  y += 16;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(...C.text);
  const lines = pdf.splitTextToSize(text, w - 24);
  const boxH = Math.max(28, lines.length * 12 + 12);
  strokeRect(pdf, margin, y, w, boxH, C.border, 0.5);
  pdf.text(lines, margin + 12, y + 14);
  return y + boxH + 4;
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

/* ─── Section content builders ───────────────────────────────────────────── */
const actionPill = (code) => {
  if (!code || !ACTION_LABELS[code]) return null;
  const palette = C[code] || C.no_action;
  return {
    pill: {
      text: ACTION_LABELS[code].en.toUpperCase(),
      bg: palette.bg,
      fg: palette.fg,
    },
  };
};

const renderInfoSections = (pdf, submission) => {
  let y = drawHeader(pdf, submission);
  y = drawStatusBadge(pdf, y, submission.status);

  // 1. Salesman
  y = drawSectionHeader(pdf, y, 'Salesman Information');
  y = drawKvRows(pdf, y, [
    { label: 'Name',           value: submission.salesmanName || '—' },
    { label: 'Submitted at',   value: fmtDateTime(submission.submittedAt) },
  ]);
  y += PT.sectionGap - 4;

  // 2. Customer
  y = ensureRoom(pdf, y, 80);
  y = drawSectionHeader(pdf, y, 'Customer Information');
  y = drawKvRows(pdf, y, [
    { label: 'Customer name',  value: submission.custName || '—' },
    { label: 'Account number', value: submission.custAccount || '—' },
  ]);
  y += PT.sectionGap - 4;

  // 3. Item
  y = ensureRoom(pdf, y, 130);
  y = drawSectionHeader(pdf, y, 'Item Details');
  const daysLabel =
    submission.daysRemaining < 0
      ? `Expired ${Math.abs(submission.daysRemaining)} day(s) ago`
      : `${submission.daysRemaining} day(s) remaining`;
  const daysCol = dayColor(submission.daysRemaining);
  y = drawKvRows(pdf, y, [
    { label: 'Description',      value: submission.itemDesc || '—' },
    { label: 'SKU',              value: submission.itemId || '—' },
    { label: 'System qty',       value: `${submission.netQty} cases` },
    { label: 'Physical qty',     value: `${submission.physQty} cases` },
    { label: 'Expiry date',      value: fmtDate(submission.expiryDate) },
    {
      label: 'Days remaining',
      value: { pill: { text: daysLabel, bg: lighten(daysCol, 0.18), fg: daysCol } },
    },
  ]);
  y += PT.sectionGap - 4;

  // 4. Salesman suggestion
  y = ensureRoom(pdf, y, 100);
  y = drawSectionHeader(pdf, y, 'Salesman Suggestion (advisory)');
  y = drawKvRows(pdf, y, [
    {
      label: 'Suggested action',
      value: actionPill(submission.salesmanSuggestion) || 'None',
    },
  ]);
  if (submission.salesmanNotes) {
    y = drawNotesBox(pdf, y, 'Notes', submission.salesmanNotes);
  }
  y += PT.sectionGap - 4;

  // 5. TM Decision
  if (submission.tmDecision) {
    y = ensureRoom(pdf, y, 100);
    y = drawSectionHeader(pdf, y, 'Trade Marketing Decision');
    y = drawKvRows(pdf, y, [
      { label: 'Decision',      value: actionPill(submission.tmDecision) || '—' },
      { label: 'Decided at',    value: fmtDateTime(submission.tmDecisionDate) },
    ]);
    if (submission.tmNotes) {
      y = drawNotesBox(pdf, y, 'TM notes', submission.tmNotes);
    }
    y += PT.sectionGap - 4;
  }

  // 6. RM Decision
  if (submission.roshenDecision) {
    y = ensureRoom(pdf, y, 120);
    y = drawSectionHeader(pdf, y, 'Roshen Manager — Final Decision');
    y = drawKvRows(pdf, y, [
      { label: 'Final decision', value: actionPill(submission.roshenDecision) || '—' },
      { label: 'Decided at',     value: fmtDateTime(submission.roshenDecisionDate) },
    ]);
    if (submission.roshenNotes) {
      y = drawNotesBox(pdf, y, 'Manager notes', submission.roshenNotes);
    }
    if (submission.editHistory && submission.editHistory.length > 0) {
      y = ensureRoom(pdf, y, 16 + submission.editHistory.length * 14);
      setText(pdf, C.muted, 9, 'bold');
      pdf.text('Edit history', PT.margin + 12, y + 12);
      y += 16;
      setText(pdf, C.text, 9, 'normal');
      submission.editHistory.forEach((h) => {
        const oldL = ACTION_LABELS[h.previousAction]?.en || h.previousAction || '—';
        const newL = ACTION_LABELS[h.newAction]?.en || h.newAction || '—';
        pdf.text(`• ${fmtDateTime(h.timestamp)}  —  ${oldL}  →  ${newL}`, PT.margin + 12, y + 10);
        y += 14;
      });
      y += 6;
    }
  }

  return y;
};

/* ─── Photo page ─────────────────────────────────────────────────────────── */
const renderPhotoPage = (pdf, submission, photoImgs) => {
  const { margin, pageW, pageH } = PT;
  const photos = [
    { img: photoImgs.expiry, caption: 'Photo 1 — Expiry date' },
    { img: photoImgs.qty,    caption: 'Photo 2 — Total stock quantity' },
  ].filter((p) => p.img);

  if (photos.length === 0) return;

  pdf.addPage();
  let y = margin;

  setText(pdf, C.primary, 16, 'bold');
  pdf.text('Submission Photos', margin, y + 14);
  setText(pdf, C.muted, 9, 'normal');
  pdf.text(`Submission #${submission.id.slice(-6).toUpperCase()}`, pageW - margin, y + 14, { align: 'right' });
  y += 24;
  pdf.setDrawColor(...C.border);
  pdf.setLineWidth(0.5);
  pdf.line(margin, y, pageW - margin, y);
  y += PT.sectionGap;

  const availableW = pageW - 2 * margin;
  const maxImgH = (pageH - 2 * margin - 80) / photos.length - 24;

  photos.forEach((p) => {
    setText(pdf, C.text, 11, 'bold');
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
    y += h + PT.sectionGap;
  });
};

/* ─── Entry point ────────────────────────────────────────────────────────── */
export const generateSubmissionPdf = async (submission /* , lang ignored — always English */) => {
  // Resolve signed photo URLs and convert to data URLs + HTMLImage so the PDF
  // gets natural dimensions for aspect-ratio preservation.
  const [expirySigned, qtySigned] = await Promise.all([
    submission.photoExpiryPath ? db.getPhotoUrl(submission.photoExpiryPath) : null,
    submission.photoQtyPath ? db.getPhotoUrl(submission.photoQtyPath) : null,
  ]);
  const [expiryData, qtyData] = await Promise.all([
    fetchAsDataUrl(expirySigned),
    fetchAsDataUrl(qtySigned),
  ]);
  const [expiryImg, qtyImg] = await Promise.all([
    loadImage(expiryData).catch(() => null),
    loadImage(qtyData).catch(() => null),
  ]);

  const { default: jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  renderInfoSections(pdf, submission);
  renderPhotoPage(pdf, submission, { expiry: expiryImg, qty: qtyImg });

  // Footer on every page.
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    drawFooter(pdf, i, total);
  }

  const dateSlug = new Date().toISOString().slice(0, 10);
  const shortId = submission.id.slice(-6);
  pdf.save(`near-expiry-${shortId}-${dateSlug}.pdf`);
};
