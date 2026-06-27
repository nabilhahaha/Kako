import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { getT } from "@/lib/i18n-server";
import { Card } from "@/components/ui/card";
import { TaskDialog } from "@/components/app/workspace/task-dialog";
import { CalendarBoard, type CalTask } from "@/components/app/workspace/calendar-board";
import { todayStr } from "@/components/app/workspace/views";
import { loadWorkspace, scopeRows, type Scope } from "@/lib/workspace-data";
import { STATUSES, priorityOpts, statusOpts, visibilityOpts, roleOpts, taskLabels } from "@/lib/task-meta";
import { createTask } from "@/lib/tasks";

const SCOPES = ["team", "my", "assigned"] as const;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; scope?: string; status?: string; priority?: string }>;
}) {
  const sp = await searchParams;
  const scope = (SCOPES.includes(sp.scope as Scope) ? sp.scope : "team") as Scope;
  const statusF = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as string) : "";
  const priorityF = ["low", "normal", "high", "urgent"].includes(sp.priority ?? "") ? (sp.priority as string) : "";

  const { user, all, assignees, taskAssignees, cities, distributors } = await loadWorkspace();
  const { t, locale } = await getT();
  const td = todayStr();

  let filtered = scopeRows(all, scope, user.id, taskAssignees);
  if (statusF) filtered = filtered.filter((r) => r.status === statusF);
  if (priorityF) filtered = filtered.filter((r) => r.priority === priorityF);

  const scheduled = filtered.filter((r) => r.due_date) as Record<string, unknown>[];
  const unscheduledCount = filtered.length - scheduled.length;
  const calTasks: CalTask[] = scheduled.map((r) => ({
    id: String(r.id), title: String(r.title), due_date: String(r.due_date),
    status: String(r.status), priority: String(r.priority ?? "normal"), assignees: taskAssignees(r.id).length,
  }));

  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const weekdays = Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2023, 0, 1 + i)))); // Sunday-first

  const dialogProps = {
    createAction: createTask, labels: taskLabels(t), assignees, roles: roleOpts(t),
    priorities: priorityOpts(t), statuses: statusOpts(t), visibilities: visibilityOpts(t), cities, distributors,
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 ps-12 lg:ps-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{t("nav.calendar")}</h1>
          <p className="text-sm text-muted">{t("ws.cal_sub")}</p>
        </div>
        <TaskDialog {...dialogProps} />
      </div>

      {/* Filters */}
      <form action="/workspace/calendar" method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="month" value={sp.month ?? ""} />
        <select name="scope" defaultValue={scope} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
          {SCOPES.map((s) => <option key={s} value={s}>{t(`ws.tab.${s}`)}</option>)}
        </select>
        <select name="status" defaultValue={statusF} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
          <option value="">{t("ws.filter.status")}: {t("common.all")}</option>
          {statusOpts(t).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select name="priority" defaultValue={priorityF} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
          <option value="">{t("ws.filter.priority")}: {t("common.all")}</option>
          {priorityOpts(t).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="submit" className="rounded-xl bg-burgundy px-3 py-2 text-sm font-medium text-cream hover:bg-burgundy-hover">{t("common.apply_filters")}</button>
      </form>

      {/* Small note when nothing is scheduled — the grid stays visible. */}
      {scheduled.length === 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-line bg-cream/40 px-3 py-2 text-sm text-muted">
          <CalendarDays className="h-4 w-4 shrink-0 text-burgundy" />
          <span>{t("ws.cal.empty_title")}. {t("ws.cal.empty_hint")}</span>
        </div>
      )}

      {/* Calendar grid is always rendered. */}
      <CalendarBoard
        tasks={calTasks}
        today={td}
        month={sp.month}
        basePath="/workspace/calendar"
        weekdays={weekdays}
        moreLabel={t("ws.cal.more")}
        dialogProps={dialogProps}
      />

      {/* Unscheduled tasks panel */}
      {unscheduledCount > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-semibold text-ink">{t("ws.cal.unscheduled")}</p>
            <p className="text-xs text-muted">{unscheduledCount}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/workspace/my-tasks" className="rounded-xl border border-line px-3 py-1.5 text-sm font-medium text-burgundy hover:bg-burgundy-soft">{t("nav.my_tasks")}</Link>
            <Link href="/workspace/assigned-by-me" className="rounded-xl border border-line px-3 py-1.5 text-sm font-medium text-burgundy hover:bg-burgundy-soft">{t("nav.assigned")}</Link>
          </div>
        </Card>
      )}
    </div>
  );
}
