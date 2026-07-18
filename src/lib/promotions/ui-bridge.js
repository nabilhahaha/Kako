/* NOT FROZEN — minimal runtime bridge for the verbatim frozen modules.
 *
 * The frozen blocks reference three top-level UI globals from the reference
 * page: Util (only .esc on the paths we import), Toast and Modal. The
 * calculation paths never touch Toast/Modal at module-evaluation time —
 * they are only invoked from UI helpers (simStrip/openSimModal) or inside
 * try/catch error reporting (PromoPublisher). Native screens plug real
 * implementations via the setters below; the defaults are safe no-ops so
 * the frozen modules also load under Node for parity verification.
 *
 * Util.esc is copied character-for-character from the reference
 * implementation (roshen_settlement_platform.html, Util IIFE).
 */

export const Util = {
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
};

let toastImpl = {
  show(msg, kind) {
    if (kind === 'err' || kind === 'warn') console.warn('[promotions toast]', msg);
    else console.log('[promotions toast]', msg);
  },
};

export const Toast = {
  show: (m, k = '') => toastImpl.show(m, k),
  ok: (m) => toastImpl.show(m, 'ok'),
  warn: (m) => toastImpl.show(m, 'warn'),
  err: (m) => toastImpl.show(m, 'err'),
};

/** Plug a native toast implementation: (message, kind: ''|'ok'|'warn'|'err') => void */
export function setToastHandler(show) {
  toastImpl = { show };
}

let modalImpl = {
  open() {
    console.warn('[promotions modal] no modal host registered in this context');
    return { close() {} };
  },
};

export const Modal = {
  open: (cfg) => modalImpl.open(cfg),
};

/** Plug a native modal implementation matching the reference Modal.open API. */
export function setModalHandler(open) {
  modalImpl = { open };
}
