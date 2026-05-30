// Central place for the vendor's sales/support contacts, used by the
// subscription lock screen, the expiry banner, module-locked notices, and the
// public landing page — until an online payment gateway is wired up,
// upgrades/renewals go through these numbers.

// Primary (Saudi) and secondary (Egypt) support numbers.
export const SUPPORT_PHONE = '+966567628842';
export const SUPPORT_PHONE_DISPLAY = '+966 56 762 8842';

export const SUPPORT_PHONE_EG = '+201044215144';
export const SUPPORT_PHONE_EG_DISPLAY = '+20 104 421 5144';

/** Both numbers, for footers/contact lists. */
export const SUPPORT_PHONES: { phone: string; display: string }[] = [
  { phone: SUPPORT_PHONE, display: SUPPORT_PHONE_DISPLAY },
  { phone: SUPPORT_PHONE_EG, display: SUPPORT_PHONE_EG_DISPLAY },
];

/** WhatsApp deep link with an optional prefilled message. Defaults to the
 *  primary number; pass a phone to target a specific one. */
export function whatsappLink(message?: string, phone: string = SUPPORT_PHONE): string {
  const digits = phone.replace(/[^0-9]/g, '');
  const q = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${digits}${q}`;
}
