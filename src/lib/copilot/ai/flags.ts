/**
 * Copilot AI — feature flag.
 *
 * The AI layer is an OPTIONAL enhancement over the deterministic Help Copilot.
 * It is controlled exclusively by the `COPILOT_AI_ENABLED` environment variable
 * and is **OFF by default**: when the variable is unset, empty, or anything
 * other than the string "true" (case-insensitive), AI is disabled and the
 * deterministic engine answers every question.
 *
 * `parseFlag` is the pure, unit-testable core; `isCopilotAiEnabled` is the thin
 * runtime reader. No `server-only` import here so the flag can be exercised in
 * unit tests, but it only ever reads a server env var in practice.
 */

/** Pure: a flag is ON only for the exact (trimmed, case-insensitive) value "true". */
export function parseFlag(value: string | undefined | null): boolean {
  return (value ?? '').trim().toLowerCase() === 'true';
}

/** Runtime: is the optional Copilot AI layer enabled? Defaults to OFF. */
export function isCopilotAiEnabled(): boolean {
  return parseFlag(process.env.COPILOT_AI_ENABLED);
}
