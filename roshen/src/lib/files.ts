"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireProfile } from "@/lib/auth";

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

type Visibility = "private" | "selected_users" | "selected_role" | "selected_scope" | "public_company";

/** Create the file_asset row (metadata first) + share grants; returns the id. */
export async function createFileAsset(fd: FormData): Promise<string> {
  const { supabase, userId, companyId } = await ctx();
  const name = str(fd, "name");
  if (!name) throw new Error("File name is required.");
  const visibility = (str(fd, "visibility") ?? "private") as Visibility;
  const tagsRaw = str(fd, "tags");
  const tags = tagsRaw ? tagsRaw.split(",").map((s) => s.trim()).filter(Boolean) : null;
  const { data, error } = await supabase
    .from("file_asset")
    .insert({
      company_id: companyId,
      owner_id: userId,
      name,
      description: str(fd, "description"),
      category: str(fd, "category"),
      tags,
      visibility,
      visible_role: visibility === "selected_role" ? (str(fd, "visible_role") as never) : null,
      related_task_id: str(fd, "related_task_id"),
      related_region_id: str(fd, "related_region_id"),
      related_city_id: str(fd, "related_city_id"),
      related_agent_id: str(fd, "related_agent_id"),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = data!.id as string;

  if (visibility === "selected_users") {
    const users = list(fd, "share_users");
    if (users.length) await supabase.from("file_share").insert(users.map((u) => ({ file_id: id, user_id: u })));
  } else if (visibility === "selected_scope") {
    const rows: { file_id: string; region_id?: string; city_id?: string; agent_id?: string }[] = [];
    for (const r of list(fd, "share_regions")) rows.push({ file_id: id, region_id: r });
    for (const c of list(fd, "share_cities")) rows.push({ file_id: id, city_id: c });
    for (const a of list(fd, "share_agents")) rows.push({ file_id: id, agent_id: a });
    if (rows.length) await supabase.from("file_share").insert(rows);
  }
  return id;
}

export async function finalizeFileAsset(fd: FormData) {
  const { supabase } = await ctx();
  const id = str(fd, "id");
  const storagePath = str(fd, "storage_path");
  if (!id || !storagePath) return;
  await supabase
    .from("file_asset")
    .update({
      storage_path: storagePath,
      filename: str(fd, "filename"),
      mime_type: str(fd, "mime_type"),
      size_bytes: fd.get("size_bytes") ? Number(fd.get("size_bytes")) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  revalidatePath("/workspace/files");
}

export async function deleteFileAsset(fd: FormData) {
  const { supabase } = await ctx();
  const id = str(fd, "id");
  if (!id) return;
  const { data: f } = await supabase.from("file_asset").select("storage_path").eq("id", id).maybeSingle();
  if (f?.storage_path) await supabase.storage.from("file-library").remove([f.storage_path as string]);
  await supabase.from("file_asset").delete().eq("id", id);
  revalidatePath("/workspace/files");
}

export async function archiveFileAsset(fd: FormData) {
  const { supabase } = await ctx();
  const id = str(fd, "id");
  if (!id) return;
  const archived = fd.get("archived") === "1";
  await supabase.from("file_asset").update({ archived, updated_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/workspace/files");
}

export async function fileSignedUrl(path: string): Promise<string | null> {
  const { supabase } = await ctx();
  const { data } = await supabase.storage.from("file-library").createSignedUrl(path, 120);
  return data?.signedUrl ?? null;
}
