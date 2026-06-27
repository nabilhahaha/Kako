"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { RotateCcw, ArrowLeft } from "lucide-react";
import { translator, LOCALE_COOKIE, type Locale } from "@/lib/i18n";

function readLocale(): Locale {
  if (typeof document === "undefined") return "en";
  const m = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]+)`));
  const v = m?.[1];
  return v === "uk" || v === "ar" ? v : "en";
}

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const t = useMemo(() => translator(readLocale()), []);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{t("common.error_title")}</h1>
      <div className="rounded-2xl border border-line bg-white p-6">
        <p className="text-sm text-muted">{t("common.error_body")}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={() => reset()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-burgundy px-4 py-2 text-sm font-medium text-cream hover:bg-burgundy-hover"
          >
            <RotateCcw className="h-4 w-4" /> {t("common.try_again")}
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm font-medium text-burgundy hover:bg-burgundy-soft"
          >
            <ArrowLeft className="h-4 w-4" /> {t("common.back_home")}
          </Link>
        </div>
      </div>
    </div>
  );
}
