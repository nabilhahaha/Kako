/** Code 39 barcode encoder (pure, dependency-free, client-safe).
 *  Code 39 is self-checking and trivially encodable: each character is 5 bars +
 *  4 spaces, every element either narrow or wide, separated by a narrow gap. We
 *  use it to render a scannable barcode of the invoice number on the printed
 *  invoice without pulling in a barcode library. Returns the element runs so a
 *  caller can paint them as SVG/HTML rects. */

// Each glyph: 9 elements (bar,space,bar,…) as n(arrow)/w(ide).
const CODE39: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw',
  E: 'wnnnwwnnn', F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn',
  I: 'nnwnnwwnn', J: 'nnnnwwwnn', K: 'wnnnnnnww', L: 'nnwnnnnww',
  M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn', P: 'nnwnwnnwn',
  Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
  U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw',
  Y: 'wwnnwnnnn', Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn',
  $: 'nwnwnwnnn', '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn',
  '*': 'nwnnwnwnn', // start / stop sentinel
};

export interface BarcodeElement {
  bar: boolean;
  /** Relative width in modules (1 = narrow, 3 = wide). */
  width: number;
}

/** Keep only characters Code 39 can represent (after upper-casing). */
export function sanitizeCode39(input: string): string {
  return (input ?? '').toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g, '');
}

/** Encode `input` to ordered bar/space runs, wrapped in the `*` start/stop. */
export function code39Bars(input: string, wide = 3): BarcodeElement[] {
  const text = `*${sanitizeCode39(input)}*`;
  const els: BarcodeElement[] = [];
  for (let ci = 0; ci < text.length; ci++) {
    const pattern = CODE39[text[ci]];
    if (!pattern) continue;
    for (let i = 0; i < pattern.length; i++) {
      els.push({ bar: i % 2 === 0, width: pattern[i] === 'w' ? wide : 1 });
    }
    if (ci < text.length - 1) els.push({ bar: false, width: 1 }); // inter-char gap
  }
  return els;
}

/** Total module width of an encoded run (for sizing the SVG viewBox). */
export function code39Width(els: BarcodeElement[]): number {
  return els.reduce((sum, e) => sum + e.width, 0);
}
