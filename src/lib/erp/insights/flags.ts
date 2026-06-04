/**
 * VANTORA Insights — feature flag. The deterministic insight layer is an
 * OPTIONAL, OFF-by-default capability controlled solely by the
 * `VANTORA_INSIGHTS_ENABLED` env var (anything but the exact string "true",
 * case-insensitive, = OFF). No LLM, no external dependency — the flag simply
 * keeps the new surfaces dormant until explicitly enabled.
 */

export function parseFlag(value: string | undefined | null): boolean {
  return (value ?? '').trim().toLowerCase() === 'true';
}

export function isInsightsEnabled(): boolean {
  return parseFlag(process.env.VANTORA_INSIGHTS_ENABLED);
}
