import type { TFn } from "@/lib/i18n";

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const STATUSES = ["not_started", "in_progress", "blocked", "waiting", "completed", "cancelled"] as const;
export const BOARD_STATUSES = ["not_started", "in_progress", "blocked", "waiting", "completed"] as const;
export const VISIBILITIES = ["private_assignee", "creator_assignee", "selected_role", "all_managers"] as const;
export const APP_ROLES = ["company_manager", "area_manager", "admin", "branch_manager", "sales_supervisor", "salesman", "finance"] as const;

export const STATUS_STYLE: Record<string, string> = {
  not_started: "bg-cream-deep text-muted",
  in_progress: "bg-sky-50 text-sky-700",
  blocked: "bg-roshen-red/10 text-roshen-red",
  waiting: "bg-amber-50 text-amber-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-cream-deep text-muted",
};
export const PRIORITY_STYLE: Record<string, string> = {
  low: "bg-cream-deep text-muted",
  normal: "bg-sky-50 text-sky-700",
  high: "bg-amber-50 text-amber-700",
  urgent: "bg-roshen-red/10 text-roshen-red",
};

export type Opt = { value: string; label: string };

export const priorityOpts = (t: TFn): Opt[] => PRIORITIES.map((k) => ({ value: k, label: t(`priority.${k}`) }));
export const statusOpts = (t: TFn): Opt[] => STATUSES.map((k) => ({ value: k, label: t(`tstatus.${k}`) }));
export const visibilityOpts = (t: TFn): Opt[] => VISIBILITIES.map((k) => ({ value: k, label: t(`vis.${k}`) }));
export const roleOpts = (t: TFn): Opt[] => APP_ROLES.map((k) => ({ value: k, label: t(`role.${k}`) }));

export function taskLabels(t: TFn): Record<string, string> {
  return {
    new_task: t("ws.new_task"),
    create: t("task.create"),
    edit: t("task.edit"),
    title: t("task.title"),
    description: t("task.description"),
    priority: t("task.priority"),
    status: t("task.status"),
    assignee: t("task.assignee"),
    assignees: t("task.assignees"),
    due_date: t("task.due_date"),
    start_date: t("task.start_date"),
    visibility: t("task.visibility"),
    visible_role: t("task.visible_role"),
    unassigned: t("ws.unassigned"),
    related: t("task.related"),
    related_city: t("slaReport.filter.city"),
    related_distributor: t("slaReport.filter.distributor"),
    save: t("common.save"),
    cancel: t("common.cancel"),
  };
}
