// PDF report generator. Builds a printable HTML template off-screen, captures
// it with html2canvas, then pages it into a PDF via jsPDF.
//
// Why html2canvas + jsPDF rather than jsPDF text APIs:
//   - Arabic shaping + RTL ligatures are hard with raw jsPDF.
//   - html2canvas captures whatever the browser already renders, including
//     Arabic glyphs, with no extra font work.

import { ACTION_LABELS, ACTION_ICONS } from './actions.js';
import { fmtDate, fmtDateTime, daysColor } from './utils.js';
import { db } from './db.js';
import { t as TR } from './lang.js';

const COLORS = {
  primary: '#C8102E',
  primaryDark: '#7f1d1d',
  text: '#111827',
  muted: '#6b7280',
  border: '#e5e7eb',
  bgSoft: '#f9fafb',
};

const STATUS_BADGE = {
  pending_tm:        { bg: '#fef3c7', fg: '#92400e', labelKey: 'reportStatusPendingTM' },
  pending_roshen:    { bg: '#dbeafe', fg: '#1e40af', labelKey: 'reportStatusPendingRM' },
  approved:          { bg: '#dcfce7', fg: '#14532d', labelKey: 'reportStatusApproved' },
  closed_no_action:  { bg: '#f3f4f6', fg: '#374151', labelKey: 'reportStatusClosed' },
};

const safe = (s) =>
  (s === null || s === undefined ? '' : String(s))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

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

const actionPill = (code, lang) => {
  if (!code || !ACTION_LABELS[code]) return '';
  const label = safe(ACTION_LABELS[code][lang]);
  const ic = ACTION_ICONS[code];
  return `<span style="display:inline-block;background:${COLORS.bgSoft};border:1px solid ${COLORS.border};border-radius:999px;padding:6px 12px;font-weight:600;font-size:13px;color:${COLORS.text}">${ic} ${label}</span>`;
};

const section = (title, body) => `
  <div style="margin-top:18px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <div style="width:4px;height:16px;background:${COLORS.primary};border-radius:2px"></div>
      <h3 style="margin:0;font-size:13px;font-weight:700;color:${COLORS.primaryDark};letter-spacing:0.5px;text-transform:uppercase">${safe(title)}</h3>
    </div>
    <div style="border:1px solid ${COLORS.border};border-radius:10px;padding:14px;background:white">
      ${body}
    </div>
  </div>
`;

const kv = (label, value) => `
  <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid ${COLORS.border};gap:12px">
    <span style="color:${COLORS.muted};font-size:12px">${safe(label)}</span>
    <span style="color:${COLORS.text};font-weight:600;font-size:13px;text-align:end">${value}</span>
  </div>
`;

const buildHtml = (s, lang, tr, photos) => {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const status = STATUS_BADGE[s.status] || STATUS_BADGE.pending_tm;
  const dCol = daysColor(s.daysRemaining);
  const dayLbl =
    s.daysRemaining < 0
      ? `${tr.daysExpired} ${Math.abs(s.daysRemaining)} ${tr.daysAr}`
      : `${s.daysRemaining} ${tr.daysAr}`;

  const expiryImg = photos?.expiry
    ? `<div style="flex:1;min-width:0"><p style="margin:0 0 6px;font-size:11px;color:${COLORS.muted};font-weight:600">📅 ${safe(tr.expiryPhoto)}</p><img src="${photos.expiry}" style="width:100%;border:1px solid ${COLORS.border};border-radius:8px;display:block;max-height:380px;object-fit:contain;background:#000" crossorigin="anonymous" /></div>`
    : '';
  const qtyImg = photos?.qty
    ? `<div style="flex:1;min-width:0"><p style="margin:0 0 6px;font-size:11px;color:${COLORS.muted};font-weight:600">📦 ${safe(tr.qtyPhoto)}</p><img src="${photos.qty}" style="width:100%;border:1px solid ${COLORS.border};border-radius:8px;display:block;max-height:380px;object-fit:contain;background:#000" crossorigin="anonymous" /></div>`
    : '';

  const tmBlock = s.tmDecision
    ? section(tr.sectionTmDecision, `
        <div style="margin-bottom:10px">${actionPill(s.tmDecision, lang)}</div>
        ${kv(tr.lastUpdate, safe(fmtDateTime(s.tmDecisionDate, lang)))}
        ${s.tmNotes ? `<p style="margin:10px 0 0;padding:10px;background:${COLORS.bgSoft};border-radius:6px;font-size:13px;line-height:1.6;color:${COLORS.text};white-space:pre-wrap">📝 ${safe(s.tmNotes)}</p>` : ''}
      `)
    : '';

  const rmBlock = s.roshenDecision
    ? section(tr.sectionRmDecision, `
        <div style="margin-bottom:10px">${actionPill(s.roshenDecision, lang)}</div>
        ${kv(tr.lastUpdate, safe(fmtDateTime(s.roshenDecisionDate, lang)))}
        ${s.roshenNotes ? `<p style="margin:10px 0 0;padding:10px;background:${COLORS.bgSoft};border-radius:6px;font-size:13px;line-height:1.6;color:${COLORS.text};white-space:pre-wrap">💬 ${safe(s.roshenNotes)}</p>` : ''}
        ${s.editHistory?.length ? `<div style="margin-top:10px;padding-top:8px;border-top:1px dashed ${COLORS.border}"><p style="margin:0 0 6px;font-size:11px;color:#7c3aed;font-weight:700">✏️ ${safe(tr.editHistory)}</p>${s.editHistory.map((h) => `<p style="margin:2px 0;font-size:11px;color:${COLORS.muted}">${safe(fmtDateTime(h.timestamp, lang))} — ${safe(ACTION_LABELS[h.previousAction]?.[lang] || '')} → ${safe(ACTION_LABELS[h.newAction]?.[lang] || '')}</p>`).join('')}</div>` : ''}
      `)
    : '';

  const photosBlock = (photos?.expiry || photos?.qty)
    ? section(tr.sectionPhotos, `<div style="display:flex;gap:12px;flex-wrap:wrap">${expiryImg}${qtyImg}</div>`)
    : '';

  return `
  <div dir="${dir}" lang="${lang}" style="width:760px;padding:28px;background:white;font-family:'Segoe UI','Tahoma','Arial',sans-serif;color:${COLORS.text};font-size:13px;line-height:1.5;box-sizing:border-box">
    <!-- HEADER -->
    <div style="border-bottom:3px solid ${COLORS.primary};padding-bottom:16px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <div style="width:38px;height:38px;border-radius:8px;background:${COLORS.primary};color:white;font-weight:800;font-size:20px;display:flex;align-items:center;justify-content:center">R</div>
            <div>
              <h1 style="margin:0;font-size:18px;font-weight:700;color:${COLORS.primaryDark}">${safe(tr.reportTitle)}</h1>
              <p style="margin:2px 0 0;font-size:11px;color:${COLORS.muted};letter-spacing:1px">${safe(tr.reportSubtitle)}</p>
            </div>
          </div>
        </div>
        <div style="text-align:end">
          <span style="display:inline-block;background:${status.bg};color:${status.fg};padding:6px 12px;border-radius:999px;font-weight:700;font-size:11px;letter-spacing:0.5px">${safe(tr[status.labelKey])}</span>
          <p style="margin:8px 0 0;font-size:11px;color:${COLORS.muted}">${safe(tr.reportSubmissionId)}: <strong style="color:${COLORS.text}" dir="ltr">#${safe(s.id.slice(-6))}</strong></p>
          <p style="margin:2px 0 0;font-size:10px;color:${COLORS.muted}">${safe(tr.reportGeneratedAt)}: ${safe(fmtDateTime(new Date().toISOString(), lang))}</p>
        </div>
      </div>
    </div>

    ${section(tr.sectionSalesman, `
      ${kv(tr.fullName, safe(s.salesmanName))}
      ${kv(tr.submittedAt, safe(fmtDateTime(s.submittedAt, lang)))}
    `)}

    ${section(tr.sectionCustomer, `
      ${kv(tr.selectCustomer, safe(s.custName))}
      ${kv(tr.reportSubmissionId === 'Submission ID' ? 'Customer account' : 'حساب العميل', `<span dir="ltr">${safe(s.custAccount)}</span>`)}
    `)}

    ${section(tr.sectionItem, `
      ${kv(tr.selectItem, safe(s.itemDesc))}
      ${kv('SKU', `<span dir="ltr">${safe(s.itemId)}</span>`)}
      ${kv(tr.systemQty, `${safe(s.netQty)} ${safe(tr.cases)}`)}
      ${kv(tr.physicalQty, `${safe(s.physQty)} ${safe(tr.cases)}`)}
      ${kv(tr.expiryDate, safe(fmtDate(s.expiryDate, lang)))}
      ${kv(tr.daysRemaining, `<span style="display:inline-block;background:${dCol.bg};color:${dCol.fg};padding:2px 8px;border-radius:999px;font-weight:700">${safe(dayLbl)}</span>`)}
    `)}

    ${section(tr.sectionSalesmanSuggestion, `
      <div style="margin-bottom:10px">${actionPill(s.salesmanSuggestion, lang)}</div>
      ${s.salesmanNotes ? `<p style="margin:0;padding:10px;background:${COLORS.bgSoft};border-radius:6px;font-size:13px;line-height:1.6;color:${COLORS.text};white-space:pre-wrap">📝 ${safe(s.salesmanNotes)}</p>` : `<p style="margin:0;color:${COLORS.muted};font-size:12px">—</p>`}
    `)}

    ${tmBlock}
    ${rmBlock}
    ${photosBlock}

    <!-- FOOTER -->
    <div style="margin-top:24px;padding-top:12px;border-top:1px solid ${COLORS.border};display:flex;justify-content:space-between;align-items:center;font-size:10px;color:${COLORS.muted}">
      <span>${safe(tr.reportGeneratedFrom)}</span>
      <span>${safe(tr.reportSubtitle)}</span>
    </div>
  </div>
  `;
};

export const generateSubmissionPdf = async (submission, lang) => {
  const tr = TR[lang] || TR.ar;

  // Resolve signed photo URLs and inline them as data: URLs so html2canvas
  // doesn't have to do a tainted-canvas dance.
  const [expirySigned, qtySigned] = await Promise.all([
    submission.photoExpiryPath ? db.getPhotoUrl(submission.photoExpiryPath) : null,
    submission.photoQtyPath ? db.getPhotoUrl(submission.photoQtyPath) : null,
  ]);
  const [expiryData, qtyData] = await Promise.all([
    fetchAsDataUrl(expirySigned),
    fetchAsDataUrl(qtySigned),
  ]);

  const html = buildHtml(submission, lang, tr, { expiry: expiryData, qty: qtyData });

  // Off-screen container.
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '-10000px';
  container.style.width = '760px';
  container.style.background = '#ffffff';
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    // Wait for images to finish loading inside the container.
    const imgs = Array.from(container.querySelectorAll('img'));
    await Promise.all(
      imgs.map((img) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise((res) => {
              img.onload = res;
              img.onerror = res;
            })
      )
    );

    const { default: html2canvas } = await import('html2canvas');
    const { default: jsPDF } = await import('jspdf');

    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * pageWidth) / canvas.width;

    const imgData = canvas.toDataURL('image/jpeg', 0.94);

    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    let pageNumber = 1;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      pageNumber += 1;
    }

    // Add a small page-number footer on each page.
    const total = pdf.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(150);
      const label = tr.reportPage.replace('{n}', i).replace('{t}', total);
      pdf.text(label, pageWidth / 2, pageHeight - 12, { align: 'center' });
    }

    const dateSlug = new Date().toISOString().slice(0, 10);
    const shortId = submission.id.slice(-6);
    pdf.save(`near-expiry-${shortId}-${dateSlug}.pdf`);

    // void unused
    void pageNumber;
  } finally {
    document.body.removeChild(container);
  }
};
