'use client';

import type { CartLine } from '../pos-cart';

function escapeHtml(s: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  return s.replace(/[&<>"]/g, (c) => map[c] ?? c);
}

/**
 * Print a minimal LOCAL receipt for an OFFLINE sale (no server invoice yet). It shows the local
 * temp number and a clear "PENDING SYNC" notice; the official ZATCA invoice number + QR are
 * finalized when the sale syncs. Uses a print window so browser print (and a future device
 * bridge) work today, with no server round-trip. The deterministic sale payload is queued
 * separately so the final receipt can be regenerated after sync.
 */
export function printOfflineReceipt(opts: {
  tempNumber: string;
  outlet: string;
  lines: readonly CartLine[];
  total: number;
  /** Thermal paper width — drives the @page size + body width (default 80mm). */
  paperWidth?: '80' | '58';
  /** Cash received / change (shown when provided). */
  received?: number | null;
  change?: number | null;
  /** Cashier name (shown when provided, per print settings). */
  cashier?: string | null;
  labels: { pending: string; total: string; temp: string; paid: string; change: string };
}): boolean {
  if (typeof window === 'undefined') return false;
  const w = window.open('', '_blank');
  if (!w) return false;  // popup blocked → caller shows the "could not print" fallback
  const widthMm = opts.paperWidth === '58' ? 58 : 80;
  const rows = opts.lines
    .map((l) => `<tr><td>${escapeHtml(l.name)}</td><td style="text-align:center">${l.qty}</td><td style="text-align:right">${(l.qty * l.price).toFixed(2)}</td></tr>`)
    .join('');
  const extra = [
    opts.received != null ? `<div class="row"><span>${escapeHtml(opts.labels.paid)}</span><span>${opts.received.toFixed(2)}</span></div>` : '',
    opts.change != null ? `<div class="row"><span>${escapeHtml(opts.labels.change)}</span><span>${opts.change.toFixed(2)}</span></div>` : '',
  ].join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(opts.tempNumber)}</title>
<style>@page{size:${widthMm}mm auto;margin:0}
body{font-family:ui-sans-serif,system-ui,sans-serif;width:${widthMm}mm;margin:0 auto;padding:6px;font-size:12px;color:#000}
h2{text-align:center;margin:4px 0;font-size:14px}.muted{color:#666;font-size:10px;text-align:center}
table{width:100%;border-collapse:collapse}td{padding:2px 0;border-bottom:1px dotted #ddd}
.row{display:flex;justify-content:space-between;font-size:11px;color:#444}
.total{font-weight:bold;font-size:14px;display:flex;justify-content:space-between;border-top:1px dashed #000;margin-top:6px;padding-top:6px}
.pending{margin-top:8px;text-align:center;font-weight:bold;color:#b45309;border:1px dashed #b45309;padding:4px;border-radius:6px;font-size:11px}</style>
</head><body>
${opts.outlet ? `<h2>${escapeHtml(opts.outlet)}</h2>` : ''}
<p class="muted">${escapeHtml(opts.labels.temp)}: ${escapeHtml(opts.tempNumber)}${opts.cashier ? ` · ${escapeHtml(opts.cashier)}` : ''}</p>
<table>${rows}</table>
<div class="total"><span>${escapeHtml(opts.labels.total)}</span><span>${opts.total.toFixed(2)}</span></div>
${extra}
<div class="pending">${escapeHtml(opts.labels.pending)}</div>
<script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
</body></html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
