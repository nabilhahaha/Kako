import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";

/** Shared Workspace data load (RLS-scoped). Reused by every workspace route. */
export async function loadWorkspace() {
  const { user } = await requireProfile();
  const supabase = await createClient();
  const [tasksRes, profilesRes, citiesRes, distsRes, taRes] = await Promise.all([
    supabase.from("task").select("id,title,priority,status,due_date,assigned_to,created_by,created_at"),
    supabase.from("profile").select("id,full_name,email"),
    supabase.from("city").select("id,name").order("name"),
    supabase.from("agent").select("id,name,code").eq("type", "distributor").order("name"),
    supabase.from("task_assignee").select("task_id,user_id"),
  ]);
  const all = (tasksRes.data ?? []) as Record<string, unknown>[];
  const nameById = new Map<string, string>();
  (profilesRes.data ?? []).forEach((p) => nameById.set(p.id, p.full_name || p.email || p.id.slice(0, 8)));
  const assignees = (profilesRes.data ?? []).map((p) => ({ value: p.id, label: p.full_name || p.email || p.id.slice(0, 8) }));
  const assigneeMap = new Map<string, string[]>();
  (taRes.data ?? []).forEach((r) => {
    const a = assigneeMap.get(r.task_id as string);
    if (a) a.push(r.user_id as string);
    else assigneeMap.set(r.task_id as string, [r.user_id as string]);
  });
  const taskAssignees = (id: unknown) => assigneeMap.get(String(id)) ?? [];
  const cities = (citiesRes.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const distributors = (distsRes.data ?? []).map((d) => ({ value: d.id, label: `${d.name} (${d.code})` }));
  return { user, supabase, all, nameById, assignees, taskAssignees, cities, distributors };
}

export type Scope = "my" | "team" | "assigned";

/** Filter loaded tasks for a given scope relative to the current user. */
export function scopeRows(
  all: Record<string, unknown>[],
  scope: Scope,
  userId: string,
  taskAssignees: (id: unknown) => string[],
) {
  return all.filter((r) =>
    scope === "my" ? taskAssignees(r.id).includes(userId) || r.assigned_to === userId
      : scope === "assigned" ? r.created_by === userId
      : true,
  );
}
