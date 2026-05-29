// Central place for the vendor's sales/support contact, used by the
// subscription lock screen, the expiry banner, and module-locked notices —
// until an online payment gateway is wired up, upgrades/renewals go through
// this number.
export const SUPPORT_PHONE = '+966567628842';
export const SUPPORT_PHONE_DISPLAY = '+966 56 762 8842';

/** WhatsApp deep link with an optional prefilled message. */
export function whatsappLink(message?: string): string {
  const digits = SUPPORT_PHONE.replace(/[^0-9]/g, '');
  const q = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${digits}${q}`;
}
