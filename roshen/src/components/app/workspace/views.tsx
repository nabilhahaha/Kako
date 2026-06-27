import Link from "next/link";
import { STATUS_STYLE, PRIORITY_STYLE, BOARD_STATUSES } from "@/lib/task-meta";
import { StatusSelect } from "@/components/app/workspace/status-select";
import { setTaskStatus } from "@/lib/tasks";

export type Row = Record<string, unknown>;
export type TFnLike = (k: string, v?: Record<string, string | number>) => string;
export type Opt = { value: string; label: string };

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const isActive = (r: Row) => r.status !== "completed" && r.status !== "cancelled";

function chipInitials(name?: string) {
  const b = (name || "?").trim();
  return b.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

export function AssigneeChips({ ids, nameById, t }: { ids: string[]; nameById: Map<string, string>; t: TFnLike }) {
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

export function ListView({ rows, nameById, getAssignees, statusOptions, t, td }: { rows: Row[]; nameById: Map<string, string>; getAssignees: (id: unknown) => string[]; statusOptions: Opt[]; t: TFnLike; td: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
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
            const overdue = isActive(r) && r.due_date && String(r.due_date) < td;
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
    </div>
  );
}

export function BoardView({ rows, nameById, getAssignees, t, td }: { rows: Row[]; nameById: Map<string, string>; getAssignees: (id: unknown) => string[]; t: TFnLike; td: string }) {
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
                const overdue = isActive(r) && r.due_date && String(r.due_date) < td;
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

export function CalendarView({ rows, td, month, basePath, weekdays }: { rows: Row[]; td: string; month?: string; basePath: string; weekdays: string[] }) {
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
    if (arr) arr.push(r); else byDay.set(k, [r]);
  }
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const prev = mm === 1 ? `${yy - 1}-12` : `${yy}-${String(mm - 1).padStart(2, "0")}`;
  const next = mm === 12 ? `${yy + 1}-01` : `${yy}-${String(mm + 1).padStart(2, "0")}`;

  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <Link href={`${basePath}?month=${prev}`} className="rounded-lg border border-line px-2.5 py-1 text-sm text-muted hover:text-burgundy">←</Link>
        <span className="font-serif text-base font-semibold text-ink">{monthStr}</span>
        <Link href={`${basePath}?month=${next}`} className="rounded-lg border border-line px-2.5 py-1 text-sm text-muted hover:text-burgundy">→</Link>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {weekdays.map((d, i) => (
          <div key={i} className="px-1 py-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted">{d}</div>
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
    </div>
  );
}
