'use client';

import { useEffect, useRef } from 'react';

/** Fires the browser print dialog once on mount — used by `?autoprint=1` print
 *  pages so a receipt can print straight after invoice confirmation. */
export function AutoPrint() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    // Let the layout paint before opening the print dialog.
    const id = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(id);
  }, []);
  return null;
}
