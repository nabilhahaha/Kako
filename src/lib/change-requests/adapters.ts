import { registerApprovalAdapter } from './registry';

// Built-in external approval adapters. Importing this module registers them. Real
// providers (ERP / government / API) are added the same way by future modules /
// industry packs — a registration, not an engine change. The `email` adapter is a
// stub seam: a real outbound mailer replaces `dispatch` without touching the engine.

registerApprovalAdapter('email', {
  async dispatch() {
    // Stub: a concrete adapter sends the approval email and returns. The inbound
    // decision arrives via POST /api/internal/change-requests/approvals/callback.
  },
});
