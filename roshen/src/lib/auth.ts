import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import type { Database } from "@/lib/database.types";

export type Profile = Database["public"]["Tables"]["profile"]["Row"];
export type AppRole = Database["public"]["Enums"]["app_role"];

/** Current auth user + their profile (cached per request). */
export const getProfile = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null as Profile | null };
  const { data: profile } = await supabase
    .from("profile")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return { user, profile: (profile as Profile | null) ?? null };
});

/** Require a signed-in user; redirect to /login otherwise. */
export async function requireProfile() {
  const { user, profile } = await getProfile();
  if (!user) redirect("/login");
  return { user, profile };
}

export function isGlobalRole(role: AppRole | null | undefined) {
  return role === "company_manager" || role === "admin";
}

/** Master-data editing is Admin-only (Company Manager is read-only on setup). */
export function isAdminRole(role: AppRole | null | undefined) {
  return role === "admin";
}
