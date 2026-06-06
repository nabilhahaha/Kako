'use client';

import { ArrowLeft } from 'lucide-react';

// A minimal, print-hidden "Back" control for print/receipt pages. These pages
// are reached by same-window navigation in the desktop shell (DF-1), so this
// lets the user return to where they were. Uses history.back() with a safe
// fallback when there is no history entry (e.g. opened directly).
export function PrintBackBar() {
  const goBack = () => {
    if (typeof window === 'undefined') return;
    if (window.history.length > 1) window.history.back();
    else window.location.assign('/');
  };
  return (
    <div className="print:hidden mb-4 flex">
      <button
        type="button"
        onClick={goBack}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-black hover:bg-gray-100"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        رجوع
      </button>
    </div>
  );
}
