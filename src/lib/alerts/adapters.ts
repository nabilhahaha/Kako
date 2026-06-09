import { registerAlertChannel } from './registry';

// Built-in alert channel adapters. Importing this module registers them. `in_app`
// is handled directly by the dispatcher (erp_notify); this registers the seam for
// out-of-app channels. The `email` adapter is a stub — a real mailer replaces
// `deliver` without any engine change; WhatsApp/SMS are added the same way.

registerAlertChannel({
  key: 'email',
  async deliver() {
    // Stub: a concrete adapter sends the alert email to the resolved recipients.
  },
});
