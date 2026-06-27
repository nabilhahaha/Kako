import Link from "next/link";
import { Plus, LayoutGrid, List as ListIcon, CalendarDays } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { getT } from "@/lib/i18n-server";
import { Card } from "@/components/ui/card";
import { TaskDialog } from "@/components/app/workspace/task-dialog";
import {
  STATUSES, STATUS_STYLE, PRIORITY_STYLE,
  priorityOpts, statusOpts, visibilityOpts, roleOpts, taskLabels,
} from "@/lib/task-meta";
import { createTask } from "@/lib/tasks";

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
  searchParams: Promise<{ tab?: string; view?: string; status?: string; priority?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const tab = (TABS.includes(sp.tab as Tab) ? sp.tab : "my") as Tab;
  const view = (VIEWS.includes(sp.view as View) ? sp.view : "list") as View;
  const statusF = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as string) : "";
  const priorityF = ["low", "normal", "high", "urgent"].includes(sp.priority ?? "") ? (sp.priority as string) : "";

  const { user } = await requireProfile();
  const supabase = await createClient();
  const { t } = await getT();

  const [tasksRes, profilesRes, citiesRes, distsRes, activityRes] = await Promise.all([
    supabase.from("task").select("id,title,priority,status,due_date,assigned_to,created_by,created_at"),
    supabase.from("profile").select("id,full_name,email"),
    supabase.from("city").select("id,name").order("name"),
    supabase.from("agent").select("id,name,code").eq("type", "distributor").order("name"),
    supabase.from("task_activity").select("id,actor_id,type,to_value,created_at,task:task_id(id,title)").order("created_at", { ascending: false }).limit(6),
  ]);
  const all = (tasksRes.data ?? []) as Record<string, unknown>[];
  const nameById = new Map<string, string>();
  (profilesRes.data ?? []).forEach((p) => nameById.set(p.id, p.full_name || p.email || p.id.slice(0, 8)));
  const assignees = (profilesRes.data ?? []).map((p) => ({ value: p.id, label: p.full_name || p.email || p.id.slice(0, 8) }));
  const cities = (citiesRes.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const distributors = (distsRes.data ?? []).map((d) => ({ value: d.id, label: `${d.name} (${d.code})` }));

  const td = todayStr();
  const active = (r: Record<string, unknown>) => r.status !== "completed" && r.status !== "cancelled";
  const kpis = [
    { k: "ws.tab.my", v: all.filter((r) => r.assigned_to === user.id).length, cls: "text-ink" },
    { k: "tstatus.in_progress", v: all.filter((r) => r.status === "in_progress").length, cls: "text-sky-700" },
    { k: "ws.kpi.completed", v: all.filter((r) => r.status === "completed").length, cls: "text-emerald-700" },
    { k: "ws.kpi.overdue", v: all.filter((r) => active(r) && r.due_date && String(r.due_date) < td).length, cls: "text-roshen-red" },
    { k: "ws.tab.team", v: all.length, cls: "text-burgundy" },
  ];

  // View list (tab + filters)
  let rows = all.filter((r) =>
    tab === "my" ? r.assigned_to === user.id : tab === "assigned" ? r.created_by === user.id : true,
  );
  if (statusF) rows = rows.filter((r) => r.status === statusF);
  if (priorityF) rows = rows.filter((r) => r.priority === priorityF);
  rows.sort((a, b) => {
    const ad = (a.due_date as string) || "9999"; const bd = (b.due_date as string) || "9999";
    return ad === bd ? String(b.created_at).localeCompare(String(a.created_at)) : ad.localeCompare(bd);
  });

  const dialogProps = {
    action: createTask, labels: taskLabels(t), assignees, roles: roleOpts(t),
    priorities: priorityOpts(t), statuses: statusOpts(t), visibilities: visibilityOpts(t), cities, distributors,
  };

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ tab, view, status: statusF, priority: priorityF, ...over });
    return `/workspace?${p.toString()}`;
  };
  const viewIcon = { list: ListIcon, board: LayoutGrid, calendar: CalendarDays };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{t("ws.title")}</h1>
          <p className="text-sm text-muted">{t("ws.subtitle")}</p>
        </div>
        <TaskDialog {...dialogProps} />
      </div>

      {/* KPI cards */}
      <section className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((c) => (
          <div key={c.k} className="rounded-2xl border border-line bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{t(c.k)}</p>
            <p className={"mt-1 font-serif text-3xl font-bold " + c.cls}>{c.v}</p>
          </div>
        ))}
      </section>

      {/* Quick actions */}
      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-white p-3"><TaskDialog {...dialogProps} /></div>
        <QuickLink href={qs({ view: "board" })} icon={<LayoutGrid className="h-5 w-5" />} label={t("ws.view.board")} />
        <QuickLink href={qs({ view: "calendar" })} icon={<CalendarDays className="h-5 w-5" />} label={t("ws.view.calendar")} />
        <QuickLink href={qs({ tab: "assigned", view: "list" })} icon={<Plus className="h-5 w-5" />} label={t("ws.tab.assigned")} />
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Tabs */}
          <div className="flex flex-wrap gap-1 border-b border-line">
            {TABS.map((tk) => (
              <Link key={tk} href={qs({ tab: tk })}
                className={"rounded-t-lg px-4 py-2 text-sm font-medium " + (tk === tab ? "border-b-2 border-burgundy text-burgundy" : "text-muted hover:text-burgundy")}>
                {t(`ws.tab.${tk}`)}
              </Link>
            ))}
          </div>

          {/* Filters + view toggle */}
          <div className="flex flex-wrap items-end justify-between gap-3">
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
              <button type="submit" className="rounded-xl bg-burgundy px-3 py-2 text-sm font-medium text-cream hover:bg-burgundy-hover">{t("common.apply_filters")}</button>
            </form>
            <div className="inline-flex rounded-xl border border-line bg-white p-0.5">
              {VIEWS.map((vk) => {
                const Icon = viewIcon[vk];
                return (
                  <Link key={vk} href={qs({ view: vk })}
                    className={"inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium " + (vk === view ? "bg-burgundy text-cream" : "text-muted hover:text-burgundy")}>
                    <Icon className="h-4 w-4" /> {t(`ws.view.${vk}`)}
                  </Link>
                );
              })}
            </div>
          </div>

          {rows.length === 0 && view !== "calendar" ? (
            <Card className="p-10 text-center">
              <p className="text-sm font-medium text-ink">{t("ws.empty")}</p>
              <p className="mt-1 text-sm text-muted">{t("ws.empty_hint")}</p>
            </Card>
          ) : view === "list" ? (
            <ListView rows={rows} nameById={nameById} t={t} td={td} active={active} />
          ) : view === "board" ? (
            <BoardView rows={rows} t={t} td={td} active={active} />
          ) : (
            <CalendarView rows={rows} td={td} month={sp.month} qs={qs} />
          )}
        </div>

        {/* Recent activity */}
        <div>
          <Card className="p-5">
            <h2 className="font-serif text-base font-semibold text-ink">{t("task.activity")}</h2>
            <div className="mt-3 space-y-3">
              {(activityRes.data ?? []).length === 0 ? (
                <p className="text-sm text-muted">{t("task.no_activity")}</p>
              ) : (
                (activityRes.data ?? []).map((a) => {
                  const verb = ({ created: "act.created", status_changed: "act.status_changed", reassigned: "act.reassigned", commented: "act.commented", edited: "act.edited" } as Record<string, string>)[String(a.type)];
                  const tk = (Array.isArray(a.task) ? a.task[0] : a.task) as { id?: string; title?: string } | null;
                  return (
                    <div key={a.id as string} className="text-sm">
                      <span className="font-medium text-ink">{nameById.get(String(a.actor_id)) ?? "—"}</span>{" "}
                      <span className="text-muted">{verb ? t(verb) : String(a.type)}</span>
                      {tk?.title ? <Link href={`/workspace/${tk.id}`} className="text-burgundy hover:underline"> · {tk.title}</Link> : null}
                      <div className="text-[11px] text-muted">{new Date(a.created_at as string).toLocaleString()}</div>
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
    <Link href={href} className="flex items-center gap-2 rounded-2xl border border-line bg-white p-4 text-sm font-medium text-ink hover:shadow-sm">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-burgundy-soft text-burgundy">{icon}</span>
      {label}
    </Link>
  );
}

type TFnLike = (k: string, v?: Record<string, string | number>) => string;
type Row = Record<string, unknown>;

function ListView({ rows, nameById, t, td, active }: { rows: Row[]; nameById: Map<string, string>; t: TFnLike; td: string; active: (r: Row) => boolean }) {
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
                <td className="px-4 py-2.5 text-muted">{r.assigned_to ? nameById.get(String(r.assigned_to)) ?? "—" : t("ws.unassigned")}</td>
                <td className="px-4 py-2.5"><span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + (PRIORITY_STYLE[String(r.priority)] ?? "")}>{t(`priority.${r.priority}`)}</span></td>
                <td className={"px-4 py-2.5 " + (overdue ? "font-medium text-roshen-red" : "text-muted")}>{r.due_date ? String(r.due_date) : "—"}</td>
                <td className="px-4 py-2.5"><span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + (STATUS_STYLE[String(r.status)] ?? "")}>{t(`tstatus.${r.status}`)}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function BoardView({ rows, t, td, active }: { rows: Row[]; t: TFnLike; td: string; active: (r: Row) => boolean }) {
  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
      {STATUSES.map((s) => {
        const col = rows.filter((r) => r.status === s);
        return (
          <div key={s} className="rounded-2xl border border-line bg-cream/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + (STATUS_STYLE[s] ?? "")}>{t(`tstatus.${s}`)}</span>
              <span className="text-xs text-muted">{col.length}</span>
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
                  </Link>
                );
              })}
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
  const startDow = first.getUTCDay(); // 0 Sun
  const daysInMonth = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const byDay = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.due_date) continue;
    const k = String(r.due_date);
    if (!k.startsWith(base.slice(0, 7))) continue;
    const arr = byDay.get(k);
    if (arr) arr.push(r);
    else byDay.set(k, [r]);
  }
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const monthStr = base.slice(0, 7);
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
