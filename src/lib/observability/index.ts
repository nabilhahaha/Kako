// Observability (Step 2 hardening) — structured logging + alerting. Dependency-
// free, safe defaults (stdout JSON; webhook only when ALERT_WEBHOOK_URL is set).
export * from './log';
export * from './alert';
