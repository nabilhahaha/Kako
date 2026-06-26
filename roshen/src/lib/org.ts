"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireProfile, isAdminRole } from "@/lib/auth";

async function ctx() {
  const { profile } = await requireProfile();
  if (!isAdminRole(profile?.role)) {
    throw new Error("Only an Admin can modify organization master data.");
  }
  const supabase = await createClient();
  const companyId = profile!.company_id!;
  return { supabase, companyId };
}

const str = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};

export async function upsertRegion(fd: FormData) {
  const { supabase, companyId } = await ctx();
  const id = str(fd, "id");
  const name = str(fd, "name");
  const code = str(fd, "code");
  if (!name) throw new Error("Region name is required.");
  const { data: country } = await supabase
    .from("country")
    .select("id")
    .eq("company_id", companyId)
    .limit(1)
    .maybeSingle();
  if (!country) throw new Error("No country configured for the company.");
  if (id) {
    await supabase.from("region").update({ name, code }).eq("id", id);
  } else {
    await supabase
      .from("region")
      .insert({ company_id: companyId, country_id: country.id, name, code });
  }
  revalidatePath("/organization");
}

export async function upsertCity(fd: FormData) {
  const { supabase, companyId } = await ctx();
  const id = str(fd, "id");
  const name = str(fd, "name");
  const region_id = str(fd, "region_id");
  if (!name) throw new Error("City name is required.");
  if (id) {
    await supabase.from("city").update({ name, region_id }).eq("id", id);
  } else {
    await supabase.from("city").insert({ company_id: companyId, name, region_id });
  }
  revalidatePath("/organization");
}

export async function upsertArea(fd: FormData) {
  const { supabase, companyId } = await ctx();
  const id = str(fd, "id");
  const name = str(fd, "name");
  const code = str(fd, "code");
  const region_id = str(fd, "region_id");
  if (!name) throw new Error("Area name is required.");
  if (!region_id) throw new Error("Region is required.");
  if (id) {
    await supabase.from("area").update({ name, code, region_id }).eq("id", id);
  } else {
    await supabase
      .from("area")
      .insert({ company_id: companyId, region_id, name, code });
  }
  revalidatePath("/organization");
}

export async function upsertBranch(fd: FormData) {
  const { supabase, companyId } = await ctx();
  const id = str(fd, "id");
  const name = str(fd, "name");
  const code = str(fd, "code");
  const area_id = str(fd, "area_id");
  const city_id = str(fd, "city_id");
  if (!name) throw new Error("Branch name is required.");
  if (!area_id) throw new Error("Area is required.");
  if (id) {
    await supabase.from("branch").update({ name, code, area_id, city_id }).eq("id", id);
  } else {
    await supabase
      .from("branch")
      .insert({ company_id: companyId, area_id, city_id, name, code });
  }
  revalidatePath("/organization");
}

/**
 * Distributor (agent) upsert for the simplified Region → City → Distributor
 * model. City is the direct location (region is derived from the city);
 * branch is left null. `area_manager_id` is the optional assigned Roshen
 * Area Manager. Admin-only (master data).
 */
export async function upsertDistributor(fd: FormData) {
  const { supabase, companyId } = await ctx();
  const id = str(fd, "id");
  const name = str(fd, "name");
  const code = str(fd, "code");
  const city_id = str(fd, "city_id");
  const channel_id = str(fd, "channel_id");
  const area_manager_id = str(fd, "area_manager_id");
  const is_active = fd.get("is_active") === "on";
  if (!name) throw new Error("Distributor name is required.");
  if (!code) throw new Error("Distributor code is required.");
  if (!city_id) throw new Error("City is required.");
  if (id) {
    await supabase
      .from("agent")
      .update({ name, code, city_id, channel_id, area_manager_id, is_active })
      .eq("id", id);
  } else {
    await supabase.from("agent").insert({
      company_id: companyId,
      type: "distributor",
      branch_id: null,
      city_id,
      channel_id,
      area_manager_id,
      name,
      code,
      is_active,
    });
  }
  revalidatePath("/organization");
}

export async function upsertAgent(fd: FormData) {
  const { supabase, companyId } = await ctx();
  const id = str(fd, "id");
  const name = str(fd, "name");
  const code = str(fd, "code");
  const branch_id = str(fd, "branch_id");
  const channel_id = str(fd, "channel_id");
  const type = (str(fd, "type") ?? "distributor") as "agent" | "distributor";
  const is_active = fd.get("is_active") === "on";
  if (!name) throw new Error("Agent name is required.");
  if (!code) throw new Error("Agent code is required.");
  if (!branch_id) throw new Error("Branch is required.");
  if (id) {
    await supabase
      .from("agent")
      .update({ name, code, branch_id, channel_id, type, is_active })
      .eq("id", id);
  } else {
    await supabase
      .from("agent")
      .insert({ company_id: companyId, branch_id, channel_id, type, name, code, is_active });
  }
  revalidatePath("/organization");
}
