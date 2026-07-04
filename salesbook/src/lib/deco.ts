import type { Customer, Locale } from './types';
import { tone, scoreCol, scoreRing } from './tokens';

export interface DecoChip { t: string; bg: string; c: string; d: string }
export interface Deco {
  col: string;
  ring: string;
  chips: DecoChip[];
  dl: string;
}

// Display decoration for a customer card (analog of the design's `deco`).
export function decoCustomer(c: Customer, lang: Locale, i = 0): Deco {
  return {
    col: scoreCol(c.score),
    ring: scoreRing(c.score),
    dl: `${(i || 0) * 50}ms`,
    chips: c.chips.map((h) => {
      const tn = tone(h.tone);
      return { t: h.t[lang] ?? h.t.ar, bg: tn.bg, c: tn.c, d: tn.d };
    }),
  };
}
