// Tone / score helpers ported verbatim from the design (SalesBook.dc.html).
// All values are CSS custom-property references resolved by globals.css.

export type ToneKey = 'g' | 'b' | 'a' | 'o' | 'r' | 'n';

export interface Tone {
  bg: string;
  c: string;
  d: string;
}

export function tone(t: ToneKey | string): Tone {
  const map: Record<string, Tone> = {
    g: { bg: 'var(--grnT)', c: 'var(--grnTx)', d: 'var(--grn)' },
    b: { bg: 'var(--priT)', c: 'var(--lnk)', d: 'var(--pri)' },
    a: { bg: 'var(--ambT)', c: 'var(--ambTx)', d: 'var(--amb)' },
    o: { bg: 'var(--orgT)', c: 'var(--orgTx)', d: 'var(--org)' },
    r: { bg: 'var(--redT)', c: 'var(--redTx)', d: 'var(--red)' },
    n: { bg: 'var(--chip)', c: 'var(--sub)', d: 'var(--fnt)' },
  };
  return map[t] || { bg: 'var(--chip)', c: 'var(--sub)', d: 'var(--fnt)' };
}

export const scoreCol = (s: number): string =>
  s >= 85 ? 'var(--grnTx)' : s >= 70 ? 'var(--lnk)' : s >= 50 ? 'var(--ambTx)' : 'var(--redTx)';

export const scoreRaw = (s: number): string =>
  s >= 85 ? 'var(--grn)' : s >= 70 ? 'var(--pri)' : s >= 50 ? 'var(--amb)' : 'var(--red)';

// score label keys resolved through i18n (see dictionaries: score.*)
export const scoreLblKey = (s: number): 'excellent' | 'good' | 'average' | 'highRisk' =>
  s >= 85 ? 'excellent' : s >= 70 ? 'good' : s >= 50 ? 'average' : 'highRisk';

export const scoreRing = (score: number): string => {
  const raw = scoreRaw(score);
  return `conic-gradient(${raw} 0 ${score}%, var(--dv) ${score}% 100%)`;
};
