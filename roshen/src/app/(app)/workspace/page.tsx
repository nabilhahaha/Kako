import Link from "next/link";
import {
  Plus, CheckSquare, Clock, CheckCircle2, AlertTriangle, Users, Activity,
  MessageSquare, UserPlus, Pencil, type LucideIcon,
} from "lucide-react";
import { getT } from "@/lib/i18n-server";
import { Card } from "@/components/ui/card";
import { TaskDialog } from "@/components/app/workspace/task-dialog";
import { STATUS_STYLE, priorityOpts, statusOpts, visibilityOpts, roleOpts, taskLabels } from "@/lib/task-meta";
import { createTask } from "@/lib/tasks";
import { loadWorkspace } from "@/lib/workspace-data";
import { todayStr, isActive } from "@/components/app/workspace/views";

export default async function WorkspaceOverviewPage() {
  const { user, supabase, all, nameById, assignees, taskAssignees, cities, distributors } = await loadWorkspace();
  const { t } = await getT();
  const { data: activity } = await supabase
    .from("task_activity")
    .select("id,actor_id,type,to_value,created_at,task:task_id(id,title)")
    .order("created_at", { ascending: false })
    .limit(6);

  const td = todayStr();
  const mine = all.filter((r) => taskAssignees(r.id).includes(user.id) || r.assigned_to === user.id);
  const myDueToday = mine.filter((r) => isActive(r) && r.due_date === td).length;
  const blocked = all.filter((r) => r.status === "blocked").length;
  const completed = all.filter((r) => r.status === "completed").length;
  const completedPct = all.length ? Math.round((100 * completed) / all.length) : 0;
  const overdue = all.filter((r) => isActive(r) && r.due_date && String(r.due_date) < td);

  const kpis: { k: string; v: number; icon: LucideIcon; chip: string; num: string; sub: string }[] = [
    { k: "ws.tab.my", v: mine.length, icon: CheckSquare, chip: "bg-burgundy-soft text-burgundy", num: "text-ink", sub: `${myDueToday} ${t("ws.kpi.due_today")}` },
    { k: "tstatus.in_progress", v: all.filter((r) => r.status === "in_progress").length, icon: Clock, chip: "bg-sky-50 text-sky-700", num: "text-sky-700", sub: `${blocked} ${t("tstatus.blocked")}` },
    { k: "ws.kpi.completed", v: completed, icon: CheckCircle2, chip: "bg-emerald-50 text-emerald-700", num: "text-emerald-700", sub: `${completedPct}%` },
    { k: "ws.kpi.overdue", v: overdue.length, icon: AlertTriangle, chip: "bg-roshen-red/10 text-roshen-red", num: "text-roshen-red", sub: t("ws.kpi.attention_sub") },
    { k: "ws.tab.team", v: all.length, icon: Users, chip: "bg-gold-soft/50 text-chocolate", num: "text-burgundy", sub: t("ws.kpi.across_team") },
  ];

  const dueToday = all.filter((r) => isActive(r) && r.due_date === td).slice(0, 6);

  // Team workload: active task count per assignee (top 6).
  const workload = new Map<string, number>();
  for (const r of all) {
    if (!isActive(r)) continue;
    for (const uid of taskAssignees(r.id)) workload.set(uid, (workload.get(uid) ?? 0) + 1);
  }
  const workloadTop = [...workload.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const workloadMax = workloadTop.length ? workloadTop[0][1] : 1;

  const dialogProps = {
    createAction: createTask, labels: taskLabels(t), assignees, roles: roleOpts(t),
    priorities: priorityOpts(t), statuses: statusOpts(t), visibilities: visibilityOpts(t), cities, distributors,
  };
  const ACT_ICON: Record<string, LucideIcon> = { created: Plus, status_changed: Activity, reassigned: UserPlus, commented: MessageSquare, edited: Pencil };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 ps-12 lg:ps-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{t("nav.ws_overview")}</h1>
          <p className="text-sm text-muted">{t("ws.overview_sub")}</p>
        </div>
        <TaskDialog {...dialogProps} />
      </div>

      {/* KPI cards */}
      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.k} className="p-4">
              <div className="flex items-start gap-3">
                <span className={"inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl " + c.chip}><Icon className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <p className={"font-serif text-3xl font-bold leading-none " + c.num}>{c.v}</p>
                  <p className="mt-1 truncate text-sm font-semibold text-ink">{t(c.k)}</p>
                  <p className="truncate text-xs text-muted">{c.sub}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Due today + Overdue */}
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-5">
            <h2 className="font-serif text-base font-semibold text-ink">{t("ws.kpi.due_today")}</h2>
            <div className="mt-3 space-y-2">
              {dueToday.length === 0 ? <p className="text-sm text-muted">—</p> : dueToday.map((r) => (
                <Link key={String(r.id)} href={`/workspace/${r.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2 hover:bg-cream/40">
                  <span className="truncate text-sm font-medium text-ink">{String(r.title)}</span>
                  <span className={"shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium " + (STATUS_STYLE[String(r.status)] ?? "")}>{t(`tstatus.${r.status}`)}</span>
                </Link>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-serif text-base font-semibold text-roshen-red">{t("ws.kpi.overdue")}</h2>
            <div className="mt-3 space-y-2">
              {overdue.length === 0 ? <p className="text-sm text-muted">—</p> : overdue.slice(0, 6).map((r) => (
                <Link key={String(r.id)} href={`/workspace/${r.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2 hover:bg-cream/40">
                  <span className="truncate text-sm font-medium text-ink">{String(r.title)}</span>
                  <span className="shrink-0 text-[11px] font-medium text-roshen-red">{String(r.due_date)}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>

        {/* Team workload + recent activity */}
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="font-serif text-base font-semibold text-ink">{t("ws.workload")}</h2>
            <div className="mt-3 space-y-2.5">
              {workloadTop.length === 0 ? <p className="text-sm text-muted">—</p> : workloadTop.map(([uid, n]) => (
                <div key={uid}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate text-ink">{nameById.get(uid) ?? uid.slice(0, 8)}</span>
                    <span className="text-muted">{n}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-cream-deep">
                    <div className="h-1.5 rounded-full bg-burgundy" style={{ width: `${Math.round((100 * n) / workloadMax)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-base font-semibold text-ink">{t("task.activity")}</h2>
              <Link href="/notifications" className="text-xs font-medium text-burgundy hover:underline">{t("notif.view")}</Link>
            </div>
            <div className="mt-3 space-y-3">
              {(activity ?? []).length === 0 ? <p className="text-sm text-muted">{t("task.no_activity")}</p> : (activity ?? []).map((a) => {
                const verb = ({ created: "act.created", status_changed: "act.status_changed", reassigned: "act.reassigned", commented: "act.commented", edited: "act.edited", attached: "act.attached" } as Record<string, string>)[String(a.type)];
                const Icon = ACT_ICON[String(a.type)] ?? Activity;
                const tk = (Array.isArray(a.task) ? a.task[0] : a.task) as { id?: string; title?: string } | null;
                return (
                  <div key={a.id as string} className="flex gap-2.5">
                    <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cream-deep text-muted"><Icon className="h-3.5 w-3.5" /></span>
                    <div className="min-w-0 text-sm">
                      <span className="font-medium text-ink">{nameById.get(String(a.actor_id)) ?? "—"}</span>{" "}
                      <span className="text-muted">{verb ? t(verb) : String(a.type)}</span>
                      {tk?.title ? <Link href={`/workspace/${tk.id}`} className="text-burgundy hover:underline"> · {tk.title}</Link> : null}
                      <div className="text-[11px] text-muted">{new Date(a.created_at as string).toLocaleString()}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
