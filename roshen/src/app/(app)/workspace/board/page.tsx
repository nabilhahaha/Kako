import { getT } from "@/lib/i18n-server";
import { BoardView, todayStr } from "@/components/app/workspace/views";
import { TaskDialog } from "@/components/app/workspace/task-dialog";
import { loadWorkspace } from "@/lib/workspace-data";
import { priorityOpts, statusOpts, visibilityOpts, roleOpts, taskLabels } from "@/lib/task-meta";
import { createTask } from "@/lib/tasks";

export default async function BoardPage() {
  const { all, nameById, assignees, taskAssignees, cities, distributors } = await loadWorkspace();
  const { t } = await getT();
  const dialogProps = {
    createAction: createTask, labels: taskLabels(t), assignees, roles: roleOpts(t),
    priorities: priorityOpts(t), statuses: statusOpts(t), visibilities: visibilityOpts(t), cities, distributors,
  };
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 ps-12 lg:ps-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{t("nav.board")}</h1>
          <p className="text-sm text-muted">{t("ws.board_sub")}</p>
        </div>
        <TaskDialog {...dialogProps} />
      </div>
      <BoardView rows={all} nameById={nameById} getAssignees={taskAssignees} t={t} td={todayStr()} />
    </div>
  );
}
