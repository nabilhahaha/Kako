/* Loose declarations for the (non-frozen) UI bridge. */
export declare const Util: { esc: (s: unknown) => string };
export declare const Toast: {
  show: (m: string, k?: string) => void;
  ok: (m: string) => void;
  warn: (m: string) => void;
  err: (m: string) => void;
};
export declare function setToastHandler(show: (msg: string, kind: string) => void): void;
export declare const Modal: { open: (cfg: unknown) => unknown };
export declare function setModalHandler(open: (cfg: unknown) => unknown): void;
