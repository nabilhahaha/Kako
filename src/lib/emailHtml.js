// Email body / subject generator for a visit + its items.
// English-only, inline-styled HTML for maximum email-client compatibility.

import { ACTION_LABELS } from './actions.js';

/* ─── Design tokens (inline-friendly) ─────────────────────────────────────── */
const COLOR = {
  primary:    '#C8102E',
  white:      '#ffffff',
  border:     '#dddddd',
  bgRow:      '#f9f9f9',
  text:       '#333333',
  muted:      '#777777',
  approved:   '#10B981',
  pending:    '#F59E0B',
  pendingRm:  '#FBBF24',
  closed:     '#6B7280',
  expired:    '#7f1d1d',
  critical:   '#dc2626',
  warning:    '#d97706',
  safe:       '#16a34a',
};

const VISIT_STATUS = {
  draft:          { label: 'DRAFT',           bg: COLOR.closed,    fg: '#fff' },
  pending_tm:     { label: 'PENDING TM',      bg: COLOR.pending,   fg: '#fff' },
  pending_roshen: { label: 'PENDING RM',      bg: COLOR.pendingRm, fg: '#111' },
  completed:      { label: 'APPROVED',        bg: COLOR.approved,  fg: '#fff' },
};

const ITEM_STATUS = {
  pending_tm:       { label: 'Pending TM',  bg: COLOR.pending,   fg: '#fff' },
  pending_roshen:   { label: 'Pending RM',  bg: COLOR.pendingRm, fg: '#111' },
  approved:         { label: 'Approved',    bg: COLOR.approved,  fg: '#fff' },
  closed_no_action: { label: 'Closed',      bg: COLOR.closed,    fg: '#fff' },
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

const pill = (text, bg, fg = '#fff') =>
  `<span style="display:inline-block;background:${bg};color:${fg};padding:2px 8px;border-radius:10px;font-weight:bold;font-size:11px;white-space:nowrap">${escape(text)}</span>`;

/* ─── Visit summary block (info table) ───────────────────────────────────── */
const visitInfoTable = (visit) => {
  const status = VISIT_STATUS[visit.status] || VISIT_STATUS.pending_tm;
  const row = (label, value) =>
    `<tr>
      <td style="padding:8px;border:1px solid ${COLOR.border};background:${COLOR.bgRow};font-weight:bold;width:140px;font-size:12px;color:${COLOR.text}">${escape(label)}</td>
      <td style="padding:8px;border:1px solid ${COLOR.border};font-size:12px;color:${COLOR.text}">${value}</td>
    </tr>`;

  return `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid ${COLOR.border};width:100%;max-width:700px;font-family:Arial,sans-serif;margin:14px 0">
    <tr>
      <td colspan="2" style="background:${COLOR.primary};color:${COLOR.white};padding:10px 12px;font-weight:bold;font-size:13px;border:1px solid ${COLOR.border};letter-spacing:0.5px">
        NEAR EXPIRY VISIT REPORT — Roshen KSA × Relia Distribution
      </td>
    </tr>
    ${row('Visit ID', `<span style="font-family:monospace">#${escape(visit.id.slice(-6).toUpperCase())}</span>`)}
    ${row('Visit date', escape(fmtDate(visit.visitDate)))}
    ${row('Submitted', visit.submittedAt ? escape(fmtDate(visit.submittedAt)) : '—')}
    ${row('Status', pill(status.label, status.bg, status.fg))}
    <tr><td colspan="2" style="background:${COLOR.primary};color:${COLOR.white};padding:8px 12px;font-weight:bold;font-size:12px;border:1px solid ${COLOR.border}">SALESMAN &amp; CUSTOMER</td></tr>
    ${row('Salesman', escape(visit.salesmanName))}
    ${row('Customer', escape(visit.custName))}
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

  const headerHtml = headers
    .map(
      (h) =>
        `<th style="background:${COLOR.primary};color:${COLOR.white};padding:8px;text-align:left;font-weight:bold;font-size:11px;border:1px solid ${COLOR.border};letter-spacing:0.3px">${escape(h)}</th>`,
    )
    .join('');

  const rowsHtml = items
    .map((it, idx) => {
      const bg = idx % 2 === 0 ? COLOR.white : COLOR.bgRow;
      const stat = ITEM_STATUS[it.itemStatus] || ITEM_STATUS.pending_tm;
      const td = (content, opts = {}) =>
        `<td style="padding:8px;border:1px solid ${COLOR.border};font-size:12px;vertical-align:top;color:${COLOR.text};${opts.style || ''}">${content}</td>`;

      const cells = [
        td(String(idx + 1)),
        td(escape(it.itemDesc)),
        td(`<span style="font-family:monospace;color:${COLOR.muted}">${escape(it.itemId)}</span>`),
        td(`${it.netQty} / ${it.physQty}`),
        td(escape(fmtDate(it.expiryDate))),
        td(`<strong style="color:${daysFg(it.daysRemaining)}">${it.daysRemaining}</strong>`),
        td(escape(actionLabel(it.salesmanSuggestion))),
      ];
      if (showTm) cells.push(td(escape(actionLabel(it.tmDecision))));
      if (showRm) cells.push(td(escape(actionLabel(it.roshenDecision))));
      cells.push(td(pill(stat.label, stat.bg, stat.fg)));

      return `<tr style="background:${bg}">${cells.join('')}</tr>`;
    })
    .join('');

  // Per-item notes appendix (only if anyone wrote notes).
  const withNotes = items.filter(
    (i) => i.salesmanNotes || i.tmNotes || i.roshenNotes,
  );
  const notesHtml =
    withNotes.length === 0
      ? ''
      : `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid ${COLOR.border};width:100%;max-width:700px;font-family:Arial,sans-serif;margin:14px 0">
          <tr><td style="background:${COLOR.primary};color:${COLOR.white};padding:8px 12px;font-weight:bold;font-size:12px;border:1px solid ${COLOR.border}">ITEM NOTES</td></tr>
          ${withNotes
            .map(
              (it, i) => `<tr><td style="padding:10px 12px;border:1px solid ${COLOR.border};font-size:12px;color:${COLOR.text}">
            <p style="margin:0 0 4px;font-weight:bold">${i + 1}. ${escape(it.itemDesc)} <span style="color:${COLOR.muted};font-family:monospace">[${escape(it.itemId)}]</span></p>
            ${it.salesmanNotes ? `<p style="margin:4px 0;padding:6px 10px;background:#eff6ff;border-left:3px solid #2563eb;white-space:pre-wrap"><strong>SALESMAN:</strong> ${escape(it.salesmanNotes)}</p>` : ''}
            ${it.tmNotes        ? `<p style="margin:4px 0;padding:6px 10px;background:#fef3c7;border-left:3px solid #d97706;white-space:pre-wrap"><strong>TRADE MARKETING:</strong> ${escape(it.tmNotes)}</p>` : ''}
            ${it.roshenNotes    ? `<p style="margin:4px 0;padding:6px 10px;background:#dcfce7;border-left:3px solid #16a34a;white-space:pre-wrap"><strong>ROSHEN MANAGER:</strong> ${escape(it.roshenNotes)}</p>` : ''}
          </td></tr>`,
            )
            .join('')}
        </table>`;

  return `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid ${COLOR.border};width:100%;max-width:700px;font-family:Arial,sans-serif;margin:14px 0">
    <tr><td colspan="${headers.length}" style="background:${COLOR.primary};color:${COLOR.white};padding:10px 12px;font-weight:bold;font-size:13px;border:1px solid ${COLOR.border}">ITEMS (${items.length})</td></tr>
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>${notesHtml}`;
};

/* ─── Role-specific intro / outro ────────────────────────────────────────── */
const intro = (role) => {
  const base = 'font-family:Arial,sans-serif;font-size:13px;color:' + COLOR.text + ';line-height:1.6';
  switch (role) {
    case 'salesman':
      return `<p style="${base}">Hi Trade Marketing Team,</p>
              <p style="${base}">I have submitted a new near-expiry visit for your review:</p>`;
    case 'trade_marketing':
      return `<p style="${base}">Hi Regional Manager,</p>
              <p style="${base}">I have reviewed this visit. Please find my decisions per item below:</p>`;
    case 'roshen_manager':
      return `<p style="${base}">Dear Team,</p>
              <p style="${base}">The following near-expiry visit has been reviewed and approved for action:</p>`;
    default:
      return `<p style="${base}">Near-expiry visit details:</p>`;
  }
};

const outro = (role, senderName) => {
  const base = 'font-family:Arial,sans-serif;font-size:13px;color:' + COLOR.text + ';line-height:1.6';
  const sign = (signOff, title) =>
    `<p style="${base};margin-top:20px">Best regards,<br><strong>${escape(senderName)}</strong>${title ? `<br><span style="color:${COLOR.muted}">${title}</span>` : ''}</p>`;

  switch (role) {
    case 'salesman':
      return `<p style="${base}">Please review and provide your decisions per item.</p>
              ${sign('Best regards', '')}`;
    case 'trade_marketing':
      return `<p style="${base}">Awaiting your final approval.</p>
              ${sign('Best regards', 'Trade Marketing')}`;
    case 'roshen_manager':
      return `<p style="${base}">The complete report with photos is attached as PDF.</p>
              <p style="${base}">Please proceed with the approved action.</p>
              ${sign('Best regards', 'Regional Manager<br>Roshen KSA × Relia Distribution')}`;
    default:
      return sign('Best regards', '');
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

/* ─── Plain-text fallback (used when ClipboardItem isn't supported) ──────── */
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
    if (it.salesmanNotes) lines.push(`     · salesman: ${it.salesmanNotes.replace(/\s+/g, ' ')}`);
    if (it.tmNotes)        lines.push(`     · TM: ${it.tmNotes.replace(/\s+/g, ' ')}`);
    if (it.roshenNotes)    lines.push(`     · RM: ${it.roshenNotes.replace(/\s+/g, ' ')}`);
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
  if (role === 'roshen_manager') lines.push('Regional Manager', 'Roshen KSA × Relia Distribution');
  return lines.join('\n');
};

/* ─── Public API ─────────────────────────────────────────────────────────── */
export const buildEmail = ({ role, senderName, visit, items }) => {
  const subject = subjectFor(role, visit);
  const html = `<div style="font-family:Arial,sans-serif;color:${COLOR.text};max-width:700px">
    ${intro(role)}
    ${visitInfoTable(visit)}
    ${itemsTable(items)}
    ${outro(role, senderName)}
  </div>`;
  const plainText = plainTextFor({ role, senderName, visit, items });
  return { subject, html, plainText };
};
