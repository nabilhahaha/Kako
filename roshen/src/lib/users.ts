"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireProfile, isAdminRole } from "@/lib/auth";
import { ASSIGNABLE_ROLES } from "@/lib/roles";

type CreateInput = {
  full_name?: string;
  email: string;
  role: string;
  is_active?: boolean;
  scope?: { level: string; region_id?: string; city_id?: string; agent_id?: string } | null;
};

type CreateResult = { ok: boolean; tempPassword?: string; email?: string; error?: string };

const str = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};

/**
 * Create an Auth user via the `admin-create-user` Edge Function. The service
 * role lives only in the edge runtime — it is never exposed to the client or
 * to Vercel. We still re-check Admin here (defense in depth); the function
 * independently verifies the caller is an Admin too.
 */
export async function createUser(input: CreateInput): Promise<CreateResult> {
  const { profile } = await requireProfile();
  if (!isAdminRole(profile?.role)) return { ok: false, error: "Admin only." };
  if (!input.email || !ASSIGNABLE_ROLES.includes(input.role as never)) {
    return { ok: false, error: "A valid email and role are required." };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: "Not authenticated." };

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const scopes = input.scope?.level ? [input.scope] : [];

  try {
    const res = await fetch(`${base}/functions/v1/admin-create-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        full_name: input.full_name ?? "",
        email: input.email,
        role: input.role,
        is_active: input.is_active !== false,
        scopes,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error ?? "Could not create user." };
    revalidatePath("/users-scopes");
    return { ok: true, tempPassword: data.temp_password, email: data.email };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

/**
 * Update an existing user's profile (name / role / active) and, optionally,
 * replace their org scope. Admin-only (re-checked here; RLS profile_admin /
 * user_scope_admin enforce it at the database too).
 *
 * Scope is a safe full replace: existing rows for the user are removed, then a
 * single new row is inserted if a level + entity were chosen. An empty level
 * clears the scope (user falls back to their default role scope).
 */
export async function updateUser(fd: FormData) {
  const { profile } = await requireProfile();
  if (!isAdminRole(profile?.role)) throw new Error("Admin only.");
  const id = str(fd, "id");
  if (!id) throw new Error("Missing user id.");
  const role = str(fd, "role");
  if (!role || !ASSIGNABLE_ROLES.includes(role as never)) throw new Error("Invalid role.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("profile")
    .update({
      full_name: str(fd, "full_name"),
      role: role as never,
      is_active: fd.get("is_active") === "on" || fd.get("is_active") === "1" || fd.get("is_active") === "true",
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  // Scope replace (only when the dialog submitted scope fields).
  if (fd.has("scope_level")) {
    const level = str(fd, "scope_level"); // "" => clear
    const entity = str(fd, "scope_entity");
    await supabase.from("user_scope").delete().eq("user_id", id);
    if (level && entity && ["region", "city", "agent"].includes(level) && profile?.company_id) {
      const row: Record<string, unknown> = { company_id: profile.company_id, user_id: id, level };
      row[level === "agent" ? "agent_id" : level === "city" ? "city_id" : "region_id"] = entity;
      const { error: serr } = await supabase.from("user_scope").insert(row as never);
      if (serr) throw new Error(serr.message);
    }
  }
  revalidatePath("/users-scopes");
}

/** Toggle a user's active status. Admin-only via RLS. */
export async function setUserActive(fd: FormData) {
  const { profile } = await requireProfile();
  if (!isAdminRole(profile?.role)) throw new Error("Admin only.");
  const id = str(fd, "id");
  if (!id) return;
  const active = fd.get("active") === "1";
  const supabase = await createClient();
  const { error } = await supabase.from("profile").update({ is_active: active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/users-scopes");
}
