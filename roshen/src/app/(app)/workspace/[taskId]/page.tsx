import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { getT } from "@/lib/i18n-server";
import { Card } from "@/components/ui/card";
import { TaskDialog } from "@/components/app/workspace/task-dialog";
import {
  STATUS_STYLE, PRIORITY_STYLE,
  priorityOpts, statusOpts, visibilityOpts, roleOpts, taskLabels,
} from "@/lib/task-meta";
import { updateTask, deleteTask, addComment } from "@/lib/tasks";

export default async function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  await requireProfile();
  const supabase = await createClient();
  const { t } = await getT();

  const { data: task } = await supabase
    .from("task")
    .select("id,title,description,priority,status,due_date,start_date,assigned_to,created_by,visibility,visible_role,related_city_id,related_agent_id,created_at,updated_at")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) notFound(); // not found OR not visible under RLS

  const [profilesRes, citiesRes, distsRes, commentsRes, activityRes] = await Promise.all([
    supabase.from("profile").select("id,full_name,email"),
    supabase.from("city").select("id,name").order("name"),
    supabase.from("agent").select("id,name,code").eq("type", "distributor").order("name"),
    supabase.from("task_comment").select("id,author_id,body,created_at").eq("task_id", taskId).order("created_at", { ascending: true }),
    supabase.from("task_activity").select("id,actor_id,type,from_value,to_value,created_at").eq("task_id", taskId).order("created_at", { ascending: false }),
  ]);
  const nameById = new Map<string, string>();
  (profilesRes.data ?? []).forEach((p) => nameById.set(p.id, p.full_name || p.email || p.id.slice(0, 8)));
  const name = (id: unknown) => (id ? nameById.get(String(id)) ?? "—" : "—");
  const assignees = (profilesRes.data ?? []).map((p) => ({ value: p.id, label: p.full_name || p.email || p.id.slice(0, 8) }));
  const cities = (citiesRes.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const distributors = (distsRes.data ?? []).map((d) => ({ value: d.id, label: `${d.name} (${d.code})` }));
  const comments = commentsRes.data ?? [];
  const activity = activityRes.data ?? [];

  const editInitial: Record<string, string | null> = {
    id: String(task.id),
    title: task.title,
    description: task.description ?? "",
    priority: task.priority,
    status: task.status,
    assigned_to: (task.assigned_to as string) ?? "",
    due_date: (task.due_date as string) ?? "",
    start_date: (task.start_date as string) ?? "",
    visibility: task.visibility,
    visible_role: (task.visible_role as string) ?? "",
    related_city_id: (task.related_city_id as string) ?? "",
    related_agent_id: (task.related_agent_id as string) ?? "",
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <Link href="/workspace" className="inline-flex items-center gap-1.5 text-sm font-medium text-burgundy hover:underline">
        <ArrowLeft className="h-4 w-4" /> {t("task.back")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{task.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + (STATUS_STYLE[String(task.status)] ?? "")}>{t(`tstatus.${task.status}`)}</span>
            <span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + (PRIORITY_STYLE[String(task.priority)] ?? "")}>{t(`priority.${task.priority}`)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TaskDialog
            mode="edit"
            action={updateTask}
            labels={taskLabels(t)}
            assignees={assignees}
            roles={roleOpts(t)}
            priorities={priorityOpts(t)}
            statuses={statusOpts(t)}
            visibilities={visibilityOpts(t)}
            cities={cities}
            distributors={distributors}
            initial={editInitial}
          />
          <form action={deleteTask}>
            <input type="hidden" name="id" value={String(task.id)} />
            <button className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-roshen-red hover:bg-roshen-red/10">{t("common.delete")}</button>
          </form>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {task.description && (
            <Card className="p-5">
              <p className="whitespace-pre-wrap text-sm text-ink/90">{task.description}</p>
            </Card>
          )}

          {/* Comments */}
          <Card className="p-5">
            <h2 className="font-serif text-base font-semibold text-ink">{t("task.comments")}</h2>
            <div className="mt-3 space-y-3">
              {comments.length === 0 ? (
                <p className="text-sm text-muted">{t("task.no_comments")}</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="rounded-xl border border-line bg-white p-3">
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span className="font-medium text-ink">{name(c.author_id)}</span>
                      <span>{new Date(c.created_at as string).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink/90">{c.body}</p>
                  </div>
                ))
              )}
            </div>
            <form action={addComment} className="mt-3 flex gap-2">
              <input type="hidden" name="task_id" value={String(task.id)} />
              <input name="body" required placeholder={t("task.add_comment")} className="flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15" />
              <button className="rounded-xl bg-burgundy px-4 py-2 text-sm font-medium text-cream hover:bg-burgundy-hover">{t("task.post")}</button>
            </form>
          </Card>
        </div>

        {/* Meta + activity */}
        <div className="space-y-5">
          <Card className="p-5">
            <dl className="space-y-2 text-sm">
              <Row label={t("task.assignee")} value={task.assigned_to ? name(task.assigned_to) : t("ws.unassigned")} />
              <Row label={t("task.created_by")} value={name(task.created_by)} />
              <Row label={t("task.due_date")} value={(task.due_date as string) ?? t("task.none")} />
              <Row label={t("task.start_date")} value={(task.start_date as string) ?? t("task.none")} />
              <Row label={t("task.visibility")} value={t(`vis.${task.visibility}`)} />
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="font-serif text-base font-semibold text-ink">{t("task.activity")}</h2>
            <div className="mt-3 space-y-3">
              {activity.length === 0 ? (
                <p className="text-sm text-muted">{t("task.no_activity")}</p>
              ) : (
                activity.map((a) => {
                  const verb = ({ created: "act.created", status_changed: "act.status_changed", reassigned: "act.reassigned", commented: "act.commented", edited: "act.edited" } as Record<string, string>)[String(a.type)];
                  return (
                    <div key={a.id} className="text-sm">
                      <span className="font-medium text-ink">{name(a.actor_id)}</span>{" "}
                      <span className="text-muted">{verb ? t(verb) : String(a.type)}</span>
                      {a.type === "status_changed" && a.to_value ? (
                        <span className="text-muted"> → {t(`tstatus.${a.to_value}`)}</span>
                      ) : null}
                      <div className="text-xs text-muted">{new Date(a.created_at as string).toLocaleString()}</div>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
