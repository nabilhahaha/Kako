// Email body / subject generator for a visit + its items.
// English-only, softer corporate palette, inline-styled HTML for maximum
// email-client compatibility.

import { ACTION_LABELS } from './actions.js';

/* ─── Design tokens (inline-friendly, softened palette) ──────────────────── */
const FONT = 'Arial, Helvetica, sans-serif';

const SIZE = {
  heading: '20px',     // main heading
  sub:     '16px',     // section sub-heading
  body:    '14px',     // body text
};

const COLOR = {
  primary:    '#b91c1c',     // softer corporate red (was #C8102E)
  white:      '#ffffff',
  text:       '#1f2937',     // slightly less harsh than #111827
  muted:      '#6b7280',
  border:     '#e5e7eb',     // very subtle separators
  bgRow:      '#fafafa',
  // Status palette — muted backgrounds with darker text + matching border
  approvedBg:    '#dcfce7',  approvedFg:    '#15803d',  approvedBorder:    '#bbf7d0',
  pendingTmBg:   '#ffedd5',  pendingTmFg:   '#c2410c',  pendingTmBorder:   '#fdba74',
  pendingRmBg:   '#fef3c7',  pendingRmFg:   '#b45309',  pendingRmBorder:   '#fcd34d',
  closedBg:      '#f3f4f6',  closedFg:      '#6b7280',  closedBorder:      '#d1d5db',
  draftBg:       '#f3f4f6',  draftFg:       '#1f2937',  draftBorder:       '#d1d5db',
  // Days-remaining tones (softer)
  expired:    '#7f1d1d',
  critical:   '#b91c1c',
  warning:    '#b45309',
  safe:       '#15803d',
  // Notes accents
  blueNote:   '#1e40af',
  amberNote:  '#b45309',
  greenNote:  '#15803d',
};

const VISIT_STATUS = {
  draft:          { label: 'DRAFT',           bg: COLOR.draftBg,     fg: COLOR.draftFg,     border: COLOR.draftBorder },
  pending_tm:     { label: 'PENDING TM',      bg: COLOR.pendingTmBg, fg: COLOR.pendingTmFg, border: COLOR.pendingTmBorder },
  pending_roshen: { label: 'PENDING RM',      bg: COLOR.pendingRmBg, fg: COLOR.pendingRmFg, border: COLOR.pendingRmBorder },
  completed:      { label: 'APPROVED',        bg: COLOR.approvedBg,  fg: COLOR.approvedFg,  border: COLOR.approvedBorder },
};

const ITEM_STATUS = {
  pending_tm:       { label: 'Pending TM', bg: COLOR.pendingTmBg, fg: COLOR.pendingTmFg, border: COLOR.pendingTmBorder },
  pending_roshen:   { label: 'Pending RM', bg: COLOR.pendingRmBg, fg: COLOR.pendingRmFg, border: COLOR.pendingRmBorder },
  approved:         { label: 'Approved',   bg: COLOR.approvedBg,  fg: COLOR.approvedFg,  border: COLOR.approvedBorder },
  closed_no_action: { label: 'Closed',     bg: COLOR.closedBg,    fg: COLOR.closedFg,    border: COLOR.closedBorder },
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const escape = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const daysFg = (days) => {
  if (days < 0)  return COLOR.expired;
  if (days <= 30) return COLOR.critical;
  if (days <= 60) return COLOR.warning;
  return COLOR.safe;
};

const actionLabel = (code) =>
  code && ACTION_LABELS[code] ? ACTION_LABELS[code].en : '—';

const pill = (text, status) =>
  `<span style="display:inline-block;background:${status.bg};color:${status.fg};border:1px solid ${status.border};padding:3px 10px;border-radius:12px;font-weight:600;font-size:12px;letter-spacing:0.2px;white-space:nowrap">${escape(text)}</span>`;

/* ─── Visit summary block (info table) ───────────────────────────────────── */
const visitInfoTable = (visit) => {
  const status = VISIT_STATUS[visit.status] || VISIT_STATUS.pending_tm;
  const cellLabel = `padding:12px;border-bottom:1px solid ${COLOR.border};font-weight:600;width:160px;font-size:${SIZE.body};color:${COLOR.muted};vertical-align:top`;
  const cellValue = `padding:12px;border-bottom:1px solid ${COLOR.border};font-size:${SIZE.body};color:${COLOR.text};vertical-align:top`;
  const row = (label, value) =>
    `<tr><td style="${cellLabel}">${escape(label)}</td><td style="${cellValue}">${value}</td></tr>`;

  return `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid ${COLOR.border};border-radius:6px;width:100%;max-width:700px;font-family:${FONT};margin:18px 0">
    <tr>
      <td colspan="2" style="background:${COLOR.primary};color:${COLOR.white};padding:14px 16px;font-weight:600;font-size:${SIZE.sub};letter-spacing:0.3px">
        Near Expiry Visit Report &nbsp;·&nbsp; Roshen KSA &times; Relia Distribution
      </td>
    </tr>
    ${row('Visit ID', `<span style="font-family:monospace;font-weight:600">#${escape(visit.id.slice(-6).toUpperCase())}</span>`)}
    ${row('Visit date', escape(fmtDate(visit.visitDate)))}
    ${row('Submitted', visit.submittedAt ? escape(fmtDate(visit.submittedAt)) : '—')}
    ${row('Status', pill(status.label, status))}
    <tr><td colspan="2" style="background:${COLOR.bgRow};color:${COLOR.muted};padding:10px 16px;font-weight:600;font-size:13px;letter-spacing:0.4px;text-transform:uppercase;border-top:1px solid ${COLOR.border};border-bottom:1px solid ${COLOR.border}">Salesman &amp; Customer</td></tr>
    ${row('Salesman', `<span style="font-weight:600">${escape(visit.salesmanName)}</span>`)}
    ${row('Customer', `<span style="font-weight:600">${escape(visit.custName)}</span>`)}
    ${row('Account',  `<span style="font-family:monospace">${escape(visit.custAccount)}</span>`)}
    ${visit.notes ? row('Notes', `<span style="white-space:pre-wrap">${escape(visit.notes)}</span>`) : ''}
  </table>`;
};

/* ─── Items table ────────────────────────────────────────────────────────── */
const itemsTable = (items) => {
  const showTm = items.some((i) => i.tmDecision);
  const showRm = items.some((i) => i.roshenDecision);

  const headers = ['#', 'Item', 'SKU', 'Qty (sys/phys)', 'Expiry', 'Days', 'Suggestion'];
  if (showTm) headers.push('TM');
  if (showRm) headers.push('RM');
  headers.push('Status');

  const thStyle = `background:${COLOR.bgRow};color:${COLOR.muted};padding:12px;text-align:left;font-weight:600;font-size:13px;border-bottom:1px solid ${COLOR.border};letter-spacing:0.3px;text-transform:uppercase`;
  const tdStyle = `padding:12px;border-bottom:1px solid ${COLOR.border};font-size:${SIZE.body};vertical-align:top;color:${COLOR.text};line-height:1.6`;

  const headerHtml = headers.map((h) => `<th style="${thStyle}">${escape(h)}</th>`).join('');

  const rowsHtml = items
    .map((it, idx) => {
      const stat = ITEM_STATUS[it.itemStatus] || ITEM_STATUS.pending_tm;
      const td = (content) => `<td style="${tdStyle}">${content}</td>`;
      const cells = [
        td(String(idx + 1)),
        td(`<div style="font-weight:600">${escape(it.itemDesc)}</div>`),
        td(`<span style="font-family:monospace;color:${COLOR.muted};font-size:13px">${escape(it.itemId)}</span>`),
        td(`${it.netQty} / ${it.physQty}`),
        td(escape(fmtDate(it.expiryDate))),
        td(`<span style="color:${daysFg(it.daysRemaining)};font-weight:600">${it.daysRemaining}</span>`),
        td(escape(actionLabel(it.salesmanSuggestion))),
      ];
      if (showTm) cells.push(td(escape(actionLabel(it.tmDecision))));
      if (showRm) cells.push(td(escape(actionLabel(it.roshenDecision))));
      cells.push(td(pill(stat.label, stat)));
      return `<tr>${cells.join('')}</tr>`;
    })
    .join('');

  const withNotes = items.filter((i) => i.salesmanNotes || i.tmNotes || i.roshenNotes);
  const noteCard = (label, body, fg) =>
    `<div style="margin:6px 0;padding:10px 12px;background:${COLOR.bgRow};border-left:3px solid ${fg};border-radius:4px;line-height:1.6">
       <div style="font-weight:600;color:${fg};font-size:13px;letter-spacing:0.3px;text-transform:uppercase;margin-bottom:4px">${escape(label)}</div>
       <div style="white-space:pre-wrap;color:${COLOR.text};font-size:${SIZE.body}">${escape(body)}</div>
     </div>`;

  const notesHtml =
    withNotes.length === 0
      ? ''
      : `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid ${COLOR.border};border-radius:6px;width:100%;max-width:700px;font-family:${FONT};margin:18px 0">
          <tr><td style="background:${COLOR.bgRow};color:${COLOR.muted};padding:12px 16px;font-weight:600;font-size:13px;letter-spacing:0.3px;text-transform:uppercase;border-bottom:1px solid ${COLOR.border}">Item notes</td></tr>
          ${withNotes
            .map(
              (it, i) => `<tr><td style="padding:14px 16px;border-bottom:1px solid ${COLOR.border};font-size:${SIZE.body};color:${COLOR.text};line-height:1.6">
                <div style="font-weight:600">${i + 1}. ${escape(it.itemDesc)} <span style="color:${COLOR.muted};font-family:monospace;font-weight:400">[${escape(it.itemId)}]</span></div>
                ${it.salesmanNotes ? noteCard('Salesman',         it.salesmanNotes, COLOR.blueNote)  : ''}
                ${it.tmNotes       ? noteCard('Trade Marketing',  it.tmNotes,       COLOR.amberNote) : ''}
                ${it.roshenNotes   ? noteCard('Roshen Manager',   it.roshenNotes,   COLOR.greenNote) : ''}
              </td></tr>`,
            )
            .join('')}
        </table>`;

  return `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid ${COLOR.border};border-radius:6px;width:100%;max-width:700px;font-family:${FONT};margin:18px 0">
    <tr>
      <td colspan="${headers.length}" style="background:${COLOR.primary};color:${COLOR.white};padding:14px 16px;font-weight:600;font-size:${SIZE.sub};letter-spacing:0.3px">Items (${items.length})</td>
    </tr>
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>${notesHtml}`;
};

/* ─── Role-specific intro / outro ────────────────────────────────────────── */
const paragraph = (text) =>
  `<p style="font-family:${FONT};font-size:${SIZE.body};color:${COLOR.text};line-height:1.6;margin:14px 0">${text}</p>`;

const intro = (role) => {
  switch (role) {
    case 'salesman':
      return paragraph('Hi Trade Marketing Team,') +
             paragraph('I have submitted a new near-expiry visit for your review:');
    case 'trade_marketing':
      return paragraph('Hi Regional Manager,') +
             paragraph('I have reviewed this visit. Please find my decisions per item below:');
    case 'roshen_manager':
      return paragraph('Dear Team,') +
             paragraph('The following near-expiry visit has been reviewed and approved for action:');
    default:
      return paragraph('Near-expiry visit details:');
  }
};

const outro = (role, senderName) => {
  const sign = (title) =>
    `<p style="font-family:${FONT};font-size:${SIZE.body};color:${COLOR.text};line-height:1.6;margin-top:24px">Best regards,<br><span style="font-weight:600">${escape(senderName)}</span>${title ? `<br><span style="color:${COLOR.muted}">${title}</span>` : ''}</p>`;

  switch (role) {
    case 'salesman':
      return paragraph('Please review and provide your decisions per item.') + sign('');
    case 'trade_marketing':
      return paragraph('Awaiting your final approval.') + sign('Trade Marketing');
    case 'roshen_manager':
      return paragraph('The complete report with photos is attached as PDF.') +
             paragraph('Please proceed with the approved action.') +
             sign('Regional Manager<br>Roshen KSA &times; Relia Distribution');
    default:
      return sign('');
  }
};

const subjectFor = (role, visit) => {
  const short = visit.id.slice(-6).toUpperCase();
  switch (role) {
    case 'salesman':         return `Near Expiry Visit Submitted - #${short}`;
    case 'trade_marketing':  return `Near Expiry Visit - Awaiting Final Approval - #${short}`;
    case 'roshen_manager':   return `Near Expiry Visit Approved - Action Required - #${short}`;
    default:                 return `Near Expiry Visit - #${short}`;
  }
};

/* ─── Plain-text fallback ────────────────────────────────────────────────── */
const plainTextFor = ({ role, senderName, visit, items }) => {
  const status = VISIT_STATUS[visit.status]?.label || visit.status;
  const lines = [];
  if (role === 'salesman') {
    lines.push('Hi Trade Marketing Team,', '', 'I have submitted a new near-expiry visit for your review:');
  } else if (role === 'trade_marketing') {
    lines.push('Hi Regional Manager,', '', 'I have reviewed this visit. Please find my decisions per item below:');
  } else if (role === 'roshen_manager') {
    lines.push('Dear Team,', '', 'The following near-expiry visit has been reviewed and approved for action:');
  } else {
    lines.push('Near-expiry visit details:');
  }
  lines.push('');
  lines.push(`Visit ID: #${visit.id.slice(-6).toUpperCase()}`);
  lines.push(`Visit date: ${fmtDate(visit.visitDate)}`);
  if (visit.submittedAt) lines.push(`Submitted: ${fmtDate(visit.submittedAt)}`);
  lines.push(`Status: ${status}`);
  lines.push(`Salesman: ${visit.salesmanName}`);
  lines.push(`Customer: ${visit.custName} (${visit.custAccount})`);
  lines.push('');
  lines.push(`Items (${items.length}):`);
  items.forEach((it, i) => {
    const parts = [
      `${i + 1}.`,
      it.itemDesc,
      `[${it.itemId}]`,
      `qty ${it.netQty}/${it.physQty}`,
      `${it.daysRemaining}d`,
      `expiry ${fmtDate(it.expiryDate)}`,
      `suggest=${actionLabel(it.salesmanSuggestion)}`,
    ];
    if (it.tmDecision) parts.push(`TM=${actionLabel(it.tmDecision)}`);
    if (it.roshenDecision) parts.push(`RM=${actionLabel(it.roshenDecision)}`);
    parts.push(`status=${ITEM_STATUS[it.itemStatus]?.label || it.itemStatus}`);
    lines.push('  ' + parts.join('  ·  '));
    if (it.salesmanNotes) lines.push(`     - salesman: ${it.salesmanNotes.replace(/\s+/g, ' ')}`);
    if (it.tmNotes)        lines.push(`     - TM: ${it.tmNotes.replace(/\s+/g, ' ')}`);
    if (it.roshenNotes)    lines.push(`     - RM: ${it.roshenNotes.replace(/\s+/g, ' ')}`);
  });
  lines.push('');
  if (role === 'salesman') {
    lines.push('Please review and provide your decisions per item.');
  } else if (role === 'trade_marketing') {
    lines.push('Awaiting your final approval.');
  } else if (role === 'roshen_manager') {
    lines.push('The complete report with photos is attached as PDF.', 'Please proceed with the approved action.');
  }
  lines.push('', 'Best regards,', senderName);
  if (role === 'trade_marketing') lines.push('Trade Marketing');
  if (role === 'roshen_manager') lines.push('Regional Manager', 'Roshen KSA x Relia Distribution');
  return lines.join('\n');
};

/* ─── Public API ─────────────────────────────────────────────────────────── */
export const buildEmail = ({ role, senderName, visit, items }) => {
  const subject = subjectFor(role, visit);
  const html = `<div style="font-family:${FONT};color:${COLOR.text};max-width:700px;line-height:1.6;font-size:${SIZE.body}">
    <h1 style="font-family:${FONT};font-size:${SIZE.heading};color:${COLOR.text};margin:0 0 8px;font-weight:600">Near Expiry Visit Report</h1>
    <p style="font-family:${FONT};font-size:13px;color:${COLOR.muted};margin:0 0 18px;line-height:1.6">Roshen KSA &times; Relia Distribution</p>
    ${intro(role)}
    ${visitInfoTable(visit)}
    ${itemsTable(items)}
    ${outro(role, senderName)}
  </div>`;
  const plainText = plainTextFor({ role, senderName, visit, items });
  return { subject, html, plainText };
};
