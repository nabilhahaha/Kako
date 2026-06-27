"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireProfile } from "@/lib/auth";

type Priority = "low" | "normal" | "high" | "urgent";
type Status = "not_started" | "in_progress" | "blocked" | "completed" | "cancelled";
type Visibility = "private_assignee" | "creator_assignee" | "selected_role" | "all_managers";

const str = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const list = (fd: FormData, k: string) =>
  [...new Set(fd.getAll(k).map((v) => String(v).trim()).filter(Boolean))];

async function ctx() {
  const { user, profile } = await requireProfile();
  const supabase = await createClient();
  return { supabase, userId: user.id, companyId: profile!.company_id! };
}

type SB = Awaited<ReturnType<typeof createClient>>;

async function assigneeIds(supabase: SB, taskId: string): Promise<string[]> {
  const { data } = await supabase.from("task_assignee").select("user_id").eq("task_id", taskId);
  return (data ?? []).map((r) => r.user_id as string);
}

/** Notify each unique recipient (excluding the actor). */
async function notify(
  supabase: SB,
  recipients: (string | null | undefined)[],
  actorId: string,
  type: string,
  title: string,
  message: string,
  taskId: string,
) {
  const seen = new Set<string>();
  for (const r of recipients) {
    if (!r || r === actorId || seen.has(r)) continue;
    seen.add(r);
    await supabase.rpc("enqueue_notification", {
      p_user_id: r,
      p_type: type as never,
      p_title: title,
      p_message: message,
      p_task_id: taskId,
      p_action_url: `/workspace/${taskId}`,
    });
  }
}

export async function createTask(fd: FormData) {
  const { supabase, userId, companyId } = await ctx();
  const title = str(fd, "title");
  if (!title) throw new Error("Task title is required.");
  const assignees = list(fd, "assignees");
  const visibility = (str(fd, "visibility") ?? "creator_assignee") as Visibility;
  const row = {
    company_id: companyId,
    title,
    description: str(fd, "description"),
    priority: (str(fd, "priority") ?? "normal") as Priority,
    status: (str(fd, "status") ?? "not_started") as Status,
    start_date: str(fd, "start_date"),
    due_date: str(fd, "due_date"),
    assigned_to: assignees[0] ?? null,
    created_by: userId,
    visibility,
    visible_role: visibility === "selected_role" ? (str(fd, "visible_role") as never) : null,
    related_area_id: str(fd, "related_area_id"),
    related_city_id: str(fd, "related_city_id"),
    related_agent_id: str(fd, "related_agent_id"),
  };
  const { data, error } = await supabase.from("task").insert(row).select("id").single();
  if (error) throw new Error(error.message);
  const taskId = data!.id as string;
  if (assignees.length) {
    await supabase.from("task_assignee").insert(assignees.map((u) => ({ task_id: taskId, user_id: u, assigned_by: userId })));
  }
  await supabase.from("task_activity").insert({ task_id: taskId, actor_id: userId, type: "created" });
  await notify(supabase, assignees, userId, "task_assigned", "Task assigned to you", title, taskId);
  revalidatePath("/workspace");
  return taskId;
}

export async function updateTask(fd: FormData) {
  const { supabase, userId } = await ctx();
  const id = str(fd, "id");
  if (!id) throw new Error("Missing task id.");
  const title = str(fd, "title");
  if (!title) throw new Error("Task title is required.");
  const { data: before } = await supabase.from("task").select("status,created_by").eq("id", id).maybeSingle();
  const assignees = list(fd, "assignees");
  const status = (str(fd, "status") ?? "not_started") as Status;
  const visibility = (str(fd, "visibility") ?? "creator_assignee") as Visibility;
  const row = {
    title,
    description: str(fd, "description"),
    priority: (str(fd, "priority") ?? "normal") as Priority,
    status,
    start_date: str(fd, "start_date"),
    due_date: str(fd, "due_date"),
    assigned_to: assignees[0] ?? null,
    visibility,
    visible_role: visibility === "selected_role" ? (str(fd, "visible_role") as never) : null,
    related_area_id: str(fd, "related_area_id"),
    related_city_id: str(fd, "related_city_id"),
    related_agent_id: str(fd, "related_agent_id"),
    completed_at: status === "completed" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("task").update(row).eq("id", id);
  if (error) throw new Error(error.message);

  // Reconcile assignees
  const existing = await assigneeIds(supabase, id);
  const toAdd = assignees.filter((u) => !existing.includes(u));
  const toRemove = existing.filter((u) => !assignees.includes(u));
  if (toRemove.length) await supabase.from("task_assignee").delete().eq("task_id", id).in("user_id", toRemove);
  if (toAdd.length) {
    await supabase.from("task_assignee").insert(toAdd.map((u) => ({ task_id: id, user_id: u, assigned_by: userId })));
    await notify(supabase, toAdd, userId, "task_reassigned", "Task assigned to you", title, id);
  }
  if (before && before.status !== status) {
    await supabase.from("task_activity").insert({ task_id: id, actor_id: userId, type: "status_changed", from_value: before.status, to_value: status });
    await notify(supabase, [before.created_by, ...assignees], userId, "status_changed", "Task status changed", title, id);
  }
  revalidatePath("/workspace");
  revalidatePath(`/workspace/${id}`);
}

export async function setTaskStatus(fd: FormData) {
  const { supabase, userId } = await ctx();
  const id = str(fd, "id");
  const status = str(fd, "status") as Status | null;
  if (!id || !status) return;
  const { data: before } = await supabase.from("task").select("title,status,created_by").eq("id", id).maybeSingle();
  const { error } = await supabase
    .from("task")
    .update({ status, completed_at: status === "completed" ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (before && before.status !== status) {
    await supabase.from("task_activity").insert({ task_id: id, actor_id: userId, type: "status_changed", from_value: before.status, to_value: status });
    const recips = [before.created_by, ...(await assigneeIds(supabase, id))];
    await notify(supabase, recips, userId, "status_changed", "Task status changed", before.title, id);
  }
  revalidatePath("/workspace");
  revalidatePath(`/workspace/${id}`);
}

export async function addComment(fd: FormData) {
  const { supabase, userId } = await ctx();
  const id = str(fd, "task_id");
  const body = str(fd, "body");
  if (!id || !body) return;
  const { error } = await supabase.from("task_comment").insert({ task_id: id, author_id: userId, body });
  if (error) throw new Error(error.message);
  await supabase.from("task_activity").insert({ task_id: id, actor_id: userId, type: "commented" });
  const { data: tk } = await supabase.from("task").select("title,created_by").eq("id", id).maybeSingle();
  if (tk) {
    const recips = [tk.created_by, ...(await assigneeIds(supabase, id))];
    await notify(supabase, recips, userId, "comment_added", "New comment", tk.title, id);
  }
  revalidatePath(`/workspace/${id}`);
}

export async function addAttachment(fd: FormData) {
  const { supabase, userId } = await ctx();
  const taskId = str(fd, "task_id");
  const storagePath = str(fd, "storage_path");
  const filename = str(fd, "filename");
  if (!taskId || !storagePath || !filename) return;
  const { error } = await supabase.from("task_attachment").insert({
    task_id: taskId,
    storage_path: storagePath,
    filename,
    mime_type: str(fd, "mime_type"),
    size_bytes: fd.get("size_bytes") ? Number(fd.get("size_bytes")) : null,
    title: str(fd, "title"),
    uploaded_by: userId,
  });
  if (error) throw new Error(error.message);
  await supabase.from("task_activity").insert({ task_id: taskId, actor_id: userId, type: "attached" });
  const { data: tk } = await supabase.from("task").select("title,created_by").eq("id", taskId).maybeSingle();
  if (tk) {
    const recips = [tk.created_by, ...(await assigneeIds(supabase, taskId))];
    await notify(supabase, recips, userId, "file_attached", "File attached", tk.title, taskId);
  }
  revalidatePath(`/workspace/${taskId}`);
}

export async function deleteAttachment(fd: FormData) {
  const { supabase } = await ctx();
  const id = str(fd, "id");
  if (!id) return;
  const { data: a } = await supabase.from("task_attachment").select("storage_path,task_id").eq("id", id).maybeSingle();
  if (!a) return;
  await supabase.storage.from("task-attachments").remove([a.storage_path as string]);
  await supabase.from("task_attachment").delete().eq("id", id);
  revalidatePath(`/workspace/${a.task_id}`);
}

export async function attachmentSignedUrl(path: string): Promise<string | null> {
  const { supabase } = await ctx();
  const { data } = await supabase.storage.from("task-attachments").createSignedUrl(path, 120);
  return data?.signedUrl ?? null;
}

export async function deleteTask(fd: FormData) {
  const { supabase } = await ctx();
  const id = str(fd, "id");
  if (!id) return;
  const { error } = await supabase.from("task").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/workspace");
}

export async function markNotificationRead(fd: FormData) {
  const { supabase } = await ctx();
  const id = str(fd, "id");
  if (!id) return;
  await supabase.from("notification").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/workspace");
}

export async function markAllNotificationsRead() {
  const { supabase, userId } = await ctx();
  await supabase.from("notification").update({ is_read: true, read_at: new Date().toISOString() }).eq("user_id", userId).eq("is_read", false);
  revalidatePath("/workspace");
}
