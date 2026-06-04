import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Structural guarantee: the AI/interpretation layer (src/lib/copilot/ai) must
 * NEVER touch the database. It only maps a question to an intent over static
 * metadata + the caller's own context snapshot. All DB access lives in the
 * server action (src/app/(app)/copilot/ai-actions.ts), via the existing
 * RLS-scoped client. This test fails loudly if any AI-layer module imports a
 * Supabase/DB client.
 */
describe('copilot AI · no direct DB access by the AI layer', () => {
  const dir = join(process.cwd(), 'src/lib/copilot/ai');
  const sources = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

  it('has source files to check', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  for (const file of sources) {
    it(`${file} does not import or use a database client`, () => {
      const content = readFileSync(join(dir, file), 'utf8');
      expect(content).not.toMatch(/@\/lib\/supabase/);
      expect(content).not.toMatch(/createClient/);
      expect(content).not.toMatch(/supabaseClient|SupabaseClient/);
      // no raw table access either
      expect(content).not.toMatch(/\.from\(['"]erp_/);
      expect(content).not.toMatch(/\.rpc\(/);
    });
  }
});
