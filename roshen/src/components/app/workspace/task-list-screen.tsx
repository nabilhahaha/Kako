import { getT } from "@/lib/i18n-server";
import { Card } from "@/components/ui/card";
import { ListTodo } from "lucide-react";
import { TaskDialog } from "@/components/app/workspace/task-dialog";
import { ListView, todayStr } from "@/components/app/workspace/views";
import { loadWorkspace, scopeRows, type Scope } from "@/lib/workspace-data";
import {
  STATUSES, priorityOpts, statusOpts, visibilityOpts, roleOpts, taskLabels,
} from "@/lib/task-meta";
import { createTask } from "@/lib/tasks";

/** Shared single-purpose task list (My / Team / Assigned-by-me). */
export async function TaskListScreen({
  scope,
  basePath,
  titleKey,
  subtitleKey,
  searchParams,
}: {
  scope: Scope;
  basePath: string;
  titleKey: string;
  subtitleKey: string;
  searchParams: Promise<{ status?: string; priority?: string }>;
}) {
  const sp = await searchParams;
  const statusF = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as string) : "";
  const priorityF = ["low", "normal", "high", "urgent"].includes(sp.priority ?? "") ? (sp.priority as string) : "";

  const { user, all, nameById, assignees, taskAssignees, cities, distributors } = await loadWorkspace();
  const { t } = await getT();
  const td = todayStr();

  let rows = scopeRows(all, scope, user.id, taskAssignees);
  if (statusF) rows = rows.filter((r) => r.status === statusF);
  if (priorityF) rows = rows.filter((r) => r.priority === priorityF);
  rows.sort((a, b) => {
    const ad = (a.due_date as string) || "9999"; const bd = (b.due_date as string) || "9999";
    return ad === bd ? String(b.created_at).localeCompare(String(a.created_at)) : ad.localeCompare(bd);
  });

  const dialogProps = {
    createAction: createTask, labels: taskLabels(t), assignees, roles: roleOpts(t),
    priorities: priorityOpts(t), statuses: statusOpts(t), visibilities: visibilityOpts(t), cities, distributors,
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 ps-12 lg:ps-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{t(titleKey)}</h1>
          <p className="text-sm text-muted">{t(subtitleKey)}</p>
        </div>
        <TaskDialog {...dialogProps} />
      </div>

      <form action={basePath} method="get" className="flex flex-wrap items-end gap-2">
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

      {rows.length === 0 ? (
        <Card className="p-12 text-center">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-burgundy-soft text-burgundy"><ListTodo className="h-6 w-6" /></span>
          <p className="mt-3 text-base font-semibold text-ink">{t("ws.empty")}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t("ws.empty_hint")}</p>
          <div className="mt-4 flex justify-center"><TaskDialog {...dialogProps} /></div>
        </Card>
      ) : (
        <ListView rows={rows} nameById={nameById} getAssignees={taskAssignees} statusOptions={statusOpts(t)} t={t} td={td} />
      )}
    </div>
  );
}
