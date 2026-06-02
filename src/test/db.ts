import { Client } from 'pg';

/**
 * Integration-test database harness.
 *
 * These tests talk to a real Postgres (a Supabase branch DB or a local stack)
 * via `TEST_DATABASE_URL`. When the variable is absent — e.g. in CI without a
 * database — the suites `skipIf` themselves so `vitest run` stays green.
 *
 * Use the SESSION (port 5432) connection string of a *disposable* database, with
 * a superuser/owner role (the `postgres` user) so the harness can `SET ROLE
 * authenticated` to exercise RLS. Every write happens inside a transaction that
 * is always rolled back (`withRollback`), so nothing is persisted.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? '';
export const hasTestDb = TEST_DATABASE_URL.length > 0;

const isLocal = /localhost|127\.0\.0\.1/.test(TEST_DATABASE_URL);

export async function connect(): Promise<Client> {
  const client = new Client({
    connectionString: TEST_DATABASE_URL,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

/**
 * Runs `fn` inside a transaction that is ALWAYS rolled back, so integration
 * tests never leave anything behind in the target database.
 */
export async function withRollback<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = await connect();
  try {
    await client.query('begin');
    return await fn(client);
  } finally {
    await client.query('rollback').catch(() => {});
    await client.end().catch(() => {});
  }
}

/**
 * Switches the current transaction to the `authenticated` role acting as the
 * given user id — exactly what Supabase RLS sees through `auth.uid()`. Call
 * `resetRole` afterwards to go back to the owner role for further seeding.
 */
export async function actAs(client: Client, userId: string): Promise<void> {
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
  await client.query('set local role authenticated');
}

export async function resetRole(client: Client): Promise<void> {
  await client.query('reset role');
}
