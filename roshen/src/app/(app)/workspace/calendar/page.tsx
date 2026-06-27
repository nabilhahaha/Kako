import { getT } from "@/lib/i18n-server";
import { CalendarView, todayStr } from "@/components/app/workspace/views";
import { loadWorkspace } from "@/lib/workspace-data";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const { all } = await loadWorkspace();
  const { t, locale } = await getT();
  // Localized short weekday names (Sun-first) without extra i18n keys.
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const weekdays = Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2023, 0, 1 + i)))); // 2023-01-01 = Sunday

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 ps-12 lg:ps-0">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{t("nav.calendar")}</h1>
        <p className="text-sm text-muted">{t("ws.cal_sub")}</p>
      </div>
      <CalendarView rows={all} td={todayStr()} month={month} basePath="/workspace/calendar" weekdays={weekdays} />
    </div>
  );
}
