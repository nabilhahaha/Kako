"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-xl bg-burgundy px-4 py-2 text-sm font-medium text-cream hover:bg-burgundy-hover print:hidden"
    >
      <Printer className="h-4 w-4" /> {label}
    </button>
  );
}
