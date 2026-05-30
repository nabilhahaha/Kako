import type { Locale } from './config';
import { arMessages, enMessages } from './messages';

/** UI message catalog, assembled from per-module files in ./messages.
 *  Arabic is the source of truth; English mirrors it (a runtime test keeps
 *  the two key sets in sync). Use dot-paths with `t()`. */
export type Messages = typeof arMessages;

export const DICTIONARIES: Record<Locale, Messages> = {
  ar: arMessages,
  en: enMessages,
};
