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
  labels: { pending: string; total: string; temp: string };
}): void {
  if (typeof window === 'undefined') return;
  const rows = opts.lines
    .map((l) => `<tr><td>${escapeHtml(l.name)}</td><td style="text-align:center">${l.qty}</td><td style="text-align:right">${(l.qty * l.price).toFixed(2)}</td></tr>`)
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(opts.tempNumber)}</title>
<style>body{font-family:sans-serif;max-width:300px;margin:0 auto;padding:8px;font-size:13px}
h2{text-align:center;margin:4px 0}.muted{color:#666;font-size:11px;text-align:center}
table{width:100%;border-collapse:collapse}td{padding:2px 0;border-bottom:1px solid #eee}
.total{font-weight:bold;font-size:15px;display:flex;justify-content:space-between;border-top:1px solid #000;margin-top:6px;padding-top:6px}
.pending{margin-top:8px;text-align:center;font-weight:bold;color:#b45309;border:1px dashed #b45309;padding:4px;border-radius:6px}</style>
</head><body>
<h2>${escapeHtml(opts.outlet)}</h2>
<p class="muted">${escapeHtml(opts.labels.temp)}: ${escapeHtml(opts.tempNumber)}</p>
<table>${rows}</table>
<div class="total"><span>${escapeHtml(opts.labels.total)}</span><span>${opts.total.toFixed(2)}</span></div>
<div class="pending">${escapeHtml(opts.labels.pending)}</div>
<script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
