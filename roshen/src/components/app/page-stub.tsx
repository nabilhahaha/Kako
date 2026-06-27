import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getT } from "@/lib/i18n-server";

export async function PageStub({
  title,
  titleKey,
  note,
  noteKey,
}: {
  title?: string;
  titleKey?: string;
  note?: string;
  noteKey?: string;
}) {
  const { t } = await getT();
  const heading = titleKey ? t(titleKey) : title ?? "";
  const body = noteKey ? t(noteKey) : note ?? t("common.coming_soon_note");
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{heading}</h1>
        <span className="rounded-full bg-gold-soft/50 px-2.5 py-0.5 text-xs font-medium text-chocolate">
          {t("common.coming_soon")}
        </span>
      </div>
      <Card className="p-6">
        <p className="text-sm text-muted">{body}</p>
        <Link
          href="/"
          className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm font-medium text-burgundy hover:bg-burgundy-soft"
        >
          <ArrowLeft className="h-4 w-4" /> {t("common.back_home")}
        </Link>
      </Card>
    </div>
  );
}
