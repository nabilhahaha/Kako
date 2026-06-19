/**
 * Minimal pure SVG scatter renderer for the TIS demo (no browser / map library).
 * Projects lat/lng to an SVG viewport (equirectangular, north up) and draws
 * coloured dots — used to emit static "route maps" / coverage maps as artifacts.
 */
export interface SvgPoint { lat: number; lng: number; color: string }
export interface SvgLegend { label: string; color: string }

export const PALETTE = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#9333ea'];

export function pointsToSvg(points: readonly SvgPoint[], opts: { title: string; legend?: SvgLegend[]; width?: number; height?: number } ): string {
  const W = opts.width ?? 720, H = opts.height ?? 720, pad = 40, legendH = opts.legend ? 24 + opts.legend.length * 0 : 0;
  if (points.length === 0) return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"></svg>`;
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const p of points) { minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat); minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng); }
  const spanLat = Math.max(1e-6, maxLat - minLat), spanLng = Math.max(1e-6, maxLng - minLng);
  const plotW = W - pad * 2, plotH = H - pad * 2 - 40;
  const x = (lng: number) => pad + ((lng - minLng) / spanLng) * plotW;
  const y = (lat: number) => pad + 24 + (1 - (lat - minLat) / spanLat) * plotH; // flip: north up

  const dots = points.map((p) => `<circle cx="${x(p.lng).toFixed(1)}" cy="${y(p.lat).toFixed(1)}" r="3.4" fill="${p.color}" fill-opacity="0.85"/>`).join('');
  const legend = (opts.legend ?? []).map((l, i) => {
    const lx = pad + (i % 6) * 115, ly = H - 26 + Math.floor(i / 6) * 16;
    return `<rect x="${lx}" y="${ly - 8}" width="9" height="9" fill="${l.color}"/><text x="${lx + 13}" y="${ly}" font-size="10" fill="#334155">${escapeXml(l.label)}</text>`;
  }).join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#f8fafc"/>`,
    `<text x="${pad}" y="22" font-size="15" font-weight="700" fill="#0f172a">${escapeXml(opts.title)}</text>`,
    `<rect x="${pad}" y="28" width="${plotW}" height="${plotH + 8}" fill="#ffffff" stroke="#e2e8f0"/>`,
    dots, legend, `</svg>`,
  ].join('');
  void legendH;
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string));
}
