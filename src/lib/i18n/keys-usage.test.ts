import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DICTIONARIES } from './dictionaries';

/** Walk a directory collecting .ts/.tsx source files. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

function resolve(locale: 'ar' | 'en', key: string): unknown {
  return key.split('.').reduce<unknown>(
    (acc, part) =>
      acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined,
    DICTIONARIES[locale],
  );
}

describe('i18n key usage', () => {
  it('every static t(\'...\') key used in the app exists in the catalog', () => {
    const roots = ['src/app', 'src/components'].map((r) => join(process.cwd(), r));
    const files = roots.flatMap((r) => walk(r));
    // Match t('a.b.c') / t("a.b.c") — only fully-static, dotted keys (dynamic
    // keys built from variables can't be statically verified and are skipped).
    const re = /\bt\(\s*['"]([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)['"]/g;

    const missing = new Map<string, string>(); // key -> first file
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(re)) {
        const key = m[1];
        if (resolve('ar', key) === undefined && !missing.has(key)) {
          missing.set(key, file.replace(process.cwd() + '/', ''));
        }
      }
    }

    const report = [...missing.entries()].map(([k, f]) => `${k}  (${f})`);
    expect(report, `Missing i18n keys:\n${report.join('\n')}`).toEqual([]);
  });
});
