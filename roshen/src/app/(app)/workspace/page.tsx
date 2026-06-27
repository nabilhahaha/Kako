import Link from "next/link";
import {
  Plus, LayoutGrid, List as ListIcon, CalendarDays, CheckSquare, Clock, CheckCircle2,
  AlertTriangle, Users, Activity, MessageSquare, UserPlus, Pencil, ListTodo, Paperclip,
  type LucideIcon,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { getT } from "@/lib/i18n-server";
import { Card } from "@/components/ui/card";
import { TaskDialog } from "@/components/app/workspace/task-dialog";
import { StatusSelect } from "@/components/app/workspace/status-select";
import {
  STATUSES, BOARD_STATUSES, STATUS_STYLE, PRIORITY_STYLE,
  priorityOpts, statusOpts, visibilityOpts, roleOpts, taskLabels,
} from "@/lib/task-meta";
import { createTask, setTaskStatus } from "@/lib/tasks";

const TABS = ["my", "team", "assigned"] as const;
type Tab = (typeof TABS)[number];
const VIEWS = ["list", "board", "calendar"] as const;
type View = (typeof VIEWS)[number];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; view?: string; status?: string; priority?: string; month?: string; multi?: string }>;
}) {
  const sp = await searchParams;
  const tab = (TABS.includes(sp.tab as Tab) ? sp.tab : "my") as Tab;
  const view = (VIEWS.includes(sp.view as View) ? sp.view : "list") as View;
  const statusF = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as string) : "";
  const priorityF = ["low", "normal", "high", "urgent"].includes(sp.priority ?? "") ? (sp.priority as string) : "";
  const multiF = sp.multi === "1";

  const { user } = await requireProfile();
  const supabase = await createClient();
  const { t } = await getT();

  const [tasksRes, profilesRes, citiesRes, distsRes, activityRes, taRes] = await Promise.all([
    supabase.from("task").select("id,title,priority,status,due_date,assigned_to,created_by,created_at"),
    supabase.from("profile").select("id,full_name,email"),
    supabase.from("city").select("id,name").order("name"),
    supabase.from("agent").select("id,name,code").eq("type", "distributor").order("name"),
    supabase.from("task_activity").select("id,actor_id,type,to_value,created_at,task:task_id(id,title)").order("created_at", { ascending: false }).limit(6),
    supabase.from("task_assignee").select("task_id,user_id"),
  ]);
  const all = (tasksRes.data ?? []) as Record<string, unknown>[];
  const nameById = new Map<string, string>();
  (profilesRes.data ?? []).forEach((p) => nameById.set(p.id, p.full_name || p.email || p.id.slice(0, 8)));
  const assignees = (profilesRes.data ?? []).map((p) => ({ value: p.id, label: p.full_name || p.email || p.id.slice(0, 8) }));
  const assigneeMap = new Map<string, string[]>();
  (taRes.data ?? []).forEach((r) => {
    const arr = assigneeMap.get(r.task_id as string);
    if (arr) arr.push(r.user_id as string);
    else assigneeMap.set(r.task_id as string, [r.user_id as string]);
  });
  const taskAssignees = (id: unknown) => assigneeMap.get(String(id)) ?? [];
  const cities = (citiesRes.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const distributors = (distsRes.data ?? []).map((d) => ({ value: d.id, label: `${d.name} (${d.code})` }));

  const td = todayStr();
  const active = (r: Record<string, unknown>) => r.status !== "completed" && r.status !== "cancelled";
  const mine = all.filter((r) => taskAssignees(r.id).includes(user.id) || r.assigned_to === user.id);
  const myDueToday = mine.filter((r) => active(r) && r.due_date === td).length;
  const blocked = all.filter((r) => r.status === "blocked").length;
  const completed = all.filter((r) => r.status === "completed").length;
  const completedPct = all.length ? Math.round((100 * completed) / all.length) : 0;
  const kpis: { k: string; v: number; icon: LucideIcon; chip: string; num: string; sub: string }[] = [
    { k: "ws.tab.my", v: mine.length, icon: CheckSquare, chip: "bg-burgundy-soft text-burgundy", num: "text-ink", sub: `${myDueToday} ${t("ws.kpi.due_today")}` },
    { k: "tstatus.in_progress", v: all.filter((r) => r.status === "in_progress").length, icon: Clock, chip: "bg-sky-50 text-sky-700", num: "text-sky-700", sub: `${blocked} ${t("tstatus.blocked")}` },
    { k: "ws.kpi.completed", v: completed, icon: CheckCircle2, chip: "bg-emerald-50 text-emerald-700", num: "text-emerald-700", sub: `${completedPct}%` },
    { k: "ws.kpi.overdue", v: all.filter((r) => active(r) && r.due_date && String(r.due_date) < td).length, icon: AlertTriangle, chip: "bg-roshen-red/10 text-roshen-red", num: "text-roshen-red", sub: t("ws.kpi.attention_sub") },
    { k: "ws.tab.team", v: all.length, icon: Users, chip: "bg-gold-soft/50 text-chocolate", num: "text-burgundy", sub: t("ws.kpi.across_team") },
  ];

  let rows = all.filter((r) =>
    tab === "my" ? taskAssignees(r.id).includes(user.id) || r.assigned_to === user.id
      : tab === "assigned" ? r.created_by === user.id
      : true,
  );
  if (statusF) rows = rows.filter((r) => r.status === statusF);
  if (priorityF) rows = rows.filter((r) => r.priority === priorityF);
  if (multiF) rows = rows.filter((r) => taskAssignees(r.id).length > 1);
  rows.sort((a, b) => {
    const ad = (a.due_date as string) || "9999"; const bd = (b.due_date as string) || "9999";
    return ad === bd ? String(b.created_at).localeCompare(String(a.created_at)) : ad.localeCompare(bd);
  });

  const todays = all.filter((r) => active(r) && r.due_date === td).slice(0, 5);

  const dialogProps = {
    createAction: createTask, labels: taskLabels(t), assignees, roles: roleOpts(t),
    priorities: priorityOpts(t), statuses: statusOpts(t), visibilities: visibilityOpts(t), cities, distributors,
  };

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ tab, view, status: statusF, priority: priorityF, multi: multiF ? "1" : "", ...over });
    if (!p.get("multi")) p.delete("multi");
    return `/workspace?${p.toString()}`;
  };
  const viewIcon: Record<View, LucideIcon> = { list: ListIcon, board: LayoutGrid, calendar: CalendarDays };
  const ACT_ICON: Record<string, LucideIcon> = { created: Plus, status_changed: Activity, reassigned: UserPlus, commented: MessageSquare, edited: Pencil };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 ps-12 lg:ps-0">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{t("ws.title")}</h1>
          <p className="text-sm text-muted">{t("ws.subtitle")}</p>
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
        {/* Main task area */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line">
            <div className="flex flex-wrap gap-1">
              {TABS.map((tk) => (
                <Link key={tk} href={qs({ tab: tk })}
                  className={"rounded-t-lg px-4 py-2 text-sm font-medium " + (tk === tab ? "border-b-2 border-burgundy text-burgundy" : "text-muted hover:text-burgundy")}>
                  {t(`ws.tab.${tk}`)}
                </Link>
              ))}
            </div>
            <div className="mb-1 inline-flex rounded-xl border border-line bg-white p-0.5">
              {VIEWS.map((vk) => {
                const Icon = viewIcon[vk];
                return (
                  <Link key={vk} href={qs({ view: vk })}
                    className={"inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium " + (vk === view ? "bg-burgundy text-cream" : "text-muted hover:text-burgundy")}>
                    <Icon className="h-4 w-4" /> <span className="hidden sm:inline">{t(`ws.view.${vk}`)}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Filters */}
          <form action="/workspace" method="get" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="tab" value={tab} />
            <input type="hidden" name="view" value={view} />
            <select name="status" defaultValue={statusF} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
              <option value="">{t("ws.filter.status")}: {t("common.all")}</option>
              {statusOpts(t).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select name="priority" defaultValue={priorityF} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
              <option value="">{t("ws.filter.priority")}: {t("common.all")}</option>
              {priorityOpts(t).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <label className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink/80">
              <input type="checkbox" name="multi" value="1" defaultChecked={multiF} className="h-4 w-4 rounded border-line text-burgundy" />
              {t("ws.filter.multi")}
            </label>
            <button type="submit" className="rounded-xl bg-burgundy px-3 py-2 text-sm font-medium text-cream hover:bg-burgundy-hover">{t("common.apply_filters")}</button>
          </form>

          {rows.length === 0 && view !== "calendar" ? (
            <Card className="p-12 text-center">
              <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-burgundy-soft text-burgundy"><ListTodo className="h-6 w-6" /></span>
              <p className="mt-3 text-base font-semibold text-ink">{t("ws.empty")}</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t("ws.empty_hint")}</p>
              <div className="mt-4 flex justify-center"><TaskDialog {...dialogProps} /></div>
            </Card>
          ) : view === "list" ? (
            <ListView rows={rows} nameById={nameById} getAssignees={taskAssignees} statusOptions={statusOpts(t)} t={t} td={td} active={active} />
          ) : view === "board" ? (
            <BoardView rows={rows} nameById={nameById} getAssignees={taskAssignees} t={t} td={td} active={active} />
          ) : (
            <CalendarView rows={rows} td={td} month={sp.month} qs={qs} />
          )}
        </div>

        {/* Right rail */}
        <div className="space-y-5">
          {/* Today's schedule */}
          <Card className="p-5">
            <h2 className="font-serif text-base font-semibold text-ink">{t("ws.kpi.due_today")}</h2>
            <div className="mt-3 space-y-2">
              {todays.length === 0 ? (
                <p className="text-sm text-muted">—</p>
              ) : (
                todays.map((r) => (
                  <Link key={String(r.id)} href={`/workspace/${r.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2 hover:bg-cream/40">
                    <span className="truncate text-sm font-medium text-ink">{String(r.title)}</span>
                    <span className={"shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium " + (STATUS_STYLE[String(r.status)] ?? "")}>{t(`tstatus.${r.status}`)}</span>
                  </Link>
                ))
              )}
            </div>
          </Card>

          {/* Quick actions */}
          <Card className="p-5">
            <h2 className="font-serif text-base font-semibold text-ink">{t("common.actions")}</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="col-span-2"><TaskDialog {...dialogProps} /></div>
              <QuickLink href={qs({ view: "calendar" })} icon={<CalendarDays className="h-4 w-4" />} label={t("ws.view.calendar")} />
              <QuickLink href={qs({ view: "board" })} icon={<LayoutGrid className="h-4 w-4" />} label={t("ws.view.board")} />
              <QuickLink href="/workspace/files" icon={<Paperclip className="h-4 w-4" />} label={t("nav.files")} />
              <QuickLink href={qs({ tab: "assigned", view: "list" })} icon={<UserPlus className="h-4 w-4" />} label={t("ws.tab.assigned")} />
            </div>
          </Card>

          {/* Recent activity */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-base font-semibold text-ink">{t("task.activity")}</h2>
              <Link href="/notifications" className="text-xs font-medium text-burgundy hover:underline">{t("notif.view")}</Link>
            </div>
            <div className="mt-3 space-y-3">
              {(activityRes.data ?? []).length === 0 ? (
                <p className="text-sm text-muted">{t("task.no_activity")}</p>
              ) : (
                (activityRes.data ?? []).map((a) => {
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
                })
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-medium text-ink hover:border-burgundy/30 hover:bg-cream-deep/60">
      <span className="text-burgundy">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

type TFnLike = (k: string, v?: Record<string, string | number>) => string;
type Row = Record<string, unknown>;

function chipInitials(name?: string) {
  const b = (name || "?").trim();
  return b.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

function AssigneeChips({ ids, nameById, t }: { ids: string[]; nameById: Map<string, string>; t: TFnLike }) {
  if (!ids.length) return <span className="text-sm text-muted">{t("ws.unassigned")}</span>;
  const shown = ids.slice(0, 3);
  return (
    <div className="flex items-center">
      <div className="flex -space-x-1.5">
        {shown.map((id) => (
          <span key={id} title={nameById.get(id) || id} className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white bg-burgundy-soft text-[10px] font-semibold text-burgundy">
            {chipInitials(nameById.get(id))}
          </span>
        ))}
      </div>
      {ids.length > 3 && <span className="ms-1.5 text-xs text-muted">+{ids.length - 3}</span>}
    </div>
  );
}

function ListView({ rows, nameById, getAssignees, statusOptions, t, td, active }: { rows: Row[]; nameById: Map<string, string>; getAssignees: (id: unknown) => string[]; statusOptions: { value: string; label: string }[]; t: TFnLike; td: string; active: (r: Row) => boolean }) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-cream-deep/40 text-start text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-2.5 text-start font-semibold">{t("ws.col.task")}</th>
            <th className="px-4 py-2.5 text-start font-semibold">{t("ws.col.assignee")}</th>
            <th className="px-4 py-2.5 text-start font-semibold">{t("ws.col.priority")}</th>
            <th className="px-4 py-2.5 text-start font-semibold">{t("ws.col.due")}</th>
            <th className="px-4 py-2.5 text-start font-semibold">{t("ws.col.status")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const overdue = active(r) && r.due_date && String(r.due_date) < td;
            return (
              <tr key={String(r.id)} className="border-b border-line/60 last:border-0 hover:bg-cream/40">
                <td className="px-4 py-2.5 font-medium text-ink"><Link href={`/workspace/${r.id}`} className="hover:text-burgundy hover:underline">{String(r.title)}</Link></td>
                <td className="px-4 py-2.5"><AssigneeChips ids={getAssignees(r.id)} nameById={nameById} t={t} /></td>
                <td className="px-4 py-2.5"><span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + (PRIORITY_STYLE[String(r.priority)] ?? "")}>{t(`priority.${r.priority}`)}</span></td>
                <td className={"px-4 py-2.5 " + (overdue ? "font-medium text-roshen-red" : "text-muted")}>{r.due_date ? String(r.due_date) : "—"}</td>
                <td className="px-4 py-2.5"><StatusSelect id={String(r.id)} current={String(r.status)} options={statusOptions} action={setTaskStatus} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function BoardView({ rows, nameById, getAssignees, t, td, active }: { rows: Row[]; nameById: Map<string, string>; getAssignees: (id: unknown) => string[]; t: TFnLike; td: string; active: (r: Row) => boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {BOARD_STATUSES.map((s) => {
        const col = rows.filter((r) => r.status === s);
        return (
          <div key={s} className="rounded-2xl border border-line bg-cream/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + (STATUS_STYLE[s] ?? "")}>{t(`tstatus.${s}`)}</span>
              <span className="rounded-full bg-white px-1.5 text-xs font-medium text-muted">{col.length}</span>
            </div>
            <div className="space-y-2">
              {col.map((r) => {
                const overdue = active(r) && r.due_date && String(r.due_date) < td;
                return (
                  <Link key={String(r.id)} href={`/workspace/${r.id}`} className="block rounded-xl border border-line bg-white p-3 hover:shadow-sm">
                    <p className="text-sm font-medium text-ink">{String(r.title)}</p>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className={"inline-flex rounded-full px-2 py-0.5 font-medium " + (PRIORITY_STYLE[String(r.priority)] ?? "")}>{t(`priority.${r.priority}`)}</span>
                      <span className={overdue ? "font-medium text-roshen-red" : "text-muted"}>{r.due_date ? String(r.due_date) : ""}</span>
                    </div>
                    <div className="mt-2"><AssigneeChips ids={getAssignees(r.id)} nameById={nameById} t={t} /></div>
                  </Link>
                );
              })}
              {col.length === 0 && <p className="px-1 py-3 text-center text-xs text-muted/70">—</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CalendarView({ rows, td, month, qs }: { rows: Row[]; td: string; month?: string; qs: (o: Record<string, string>) => string }) {
  const base = /^\d{4}-\d{2}$/.test(month ?? "") ? `${month}-01` : `${td.slice(0, 7)}-01`;
  const [yy, mm] = base.split("-").map(Number);
  const first = new Date(Date.UTC(yy, mm - 1, 1));
  const startDow = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const monthStr = base.slice(0, 7);
  const byDay = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.due_date) continue;
    const k = String(r.due_date);
    if (!k.startsWith(monthStr)) continue;
    const arr = byDay.get(k);
    if (arr) arr.push(r);
    else byDay.set(k, [r]);
  }
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const prev = mm === 1 ? `${yy - 1}-12` : `${yy}-${String(mm - 1).padStart(2, "0")}`;
  const next = mm === 12 ? `${yy + 1}-01` : `${yy}-${String(mm + 1).padStart(2, "0")}`;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <Link href={qs({ view: "calendar", month: prev })} className="rounded-lg border border-line px-2.5 py-1 text-sm text-muted hover:text-burgundy">←</Link>
        <span className="font-serif text-base font-semibold text-ink">{monthStr}</span>
        <Link href={qs({ view: "calendar", month: next })} className="rounded-lg border border-line px-2.5 py-1 text-sm text-muted hover:text-burgundy">→</Link>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-1 py-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted">{d}</div>
        ))}
        {cells.map((d, i) => {
          const key = d ? `${monthStr}-${String(d).padStart(2, "0")}` : null;
          const dayTasks = key ? byDay.get(key) ?? [] : [];
          const isToday = key === td;
          return (
            <div key={i} className={"min-h-20 rounded-lg border border-line/60 p-1 " + (d ? "bg-white" : "bg-cream/30") + (isToday ? " ring-2 ring-burgundy/30" : "")}>
              {d && <div className="mb-1 text-[11px] font-medium text-muted">{d}</div>}
              <div className="space-y-1">
                {dayTasks.slice(0, 3).map((r) => (
                  <Link key={String(r.id)} href={`/workspace/${r.id}`} className={"block truncate rounded px-1 py-0.5 text-[11px] font-medium " + (STATUS_STYLE[String(r.status)] ?? "bg-cream-deep text-muted")}>
                    {String(r.title)}
                  </Link>
                ))}
                {dayTasks.length > 3 && <div className="px-1 text-[10px] text-muted">+{dayTasks.length - 3}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
