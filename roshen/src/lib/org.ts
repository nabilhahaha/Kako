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

/**
 * SLA sales target upsert. Targets are set at Distributor (agent) or Region
 * level, optionally per Channel, per month. Admin-only (matches RLS).
 */
export async function upsertTarget(fd: FormData) {
  const { supabase, companyId } = await ctx();
  const id = str(fd, "id");
  const monthRaw = str(fd, "period_month");
  const level = str(fd, "level"); // 'agent' | 'region'
  const entity_id = str(fd, "entity_id");
  const channel_id = str(fd, "channel_id");
  const amount = Number(str(fd, "target_amount") ?? "0") || 0;
  const workingDays = str(fd, "working_days");
  if (!monthRaw) throw new Error("Month is required.");
  if (level !== "agent" && level !== "region") throw new Error("Target level must be Distributor or Region.");
  if (!entity_id) throw new Error("Select the target entity.");
  const period_month = monthRaw.length === 7 ? `${monthRaw}-01` : monthRaw;

  const base = {
    company_id: companyId,
    period_month,
    level: level as "agent" | "region",
    channel_id,
    target_amount: amount,
    working_days: workingDays ? Number(workingDays) : null,
    region_id: level === "region" ? entity_id : null,
    agent_id: level === "agent" ? entity_id : null,
  };
  if (id) {
    await supabase.from("sla_target").update(base).eq("id", id);
  } else {
    await supabase.from("sla_target").insert(base);
  }
  revalidatePath("/sla-targets");
  revalidatePath("/sla-report");
}

export async function deleteTarget(fd: FormData) {
  const { supabase } = await ctx();
  const id = str(fd, "id");
  if (id) await supabase.from("sla_target").delete().eq("id", id);
  revalidatePath("/sla-targets");
  revalidatePath("/sla-report");
}

const entityIds = (level: string, entity_id: string | null) => ({
  region_id: level === "region" ? entity_id : null,
  city_id: level === "city" ? entity_id : null,
  agent_id: level === "agent" ? entity_id : null,
});
const numN = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v == null ? null : Number(v);
};
function validLevelEntity(fd: FormData) {
  const monthRaw = str(fd, "period_month");
  const level = str(fd, "level");
  const entity_id = str(fd, "entity_id");
  if (!monthRaw) throw new Error("Month is required.");
  if (level !== "agent" && level !== "region" && level !== "city") throw new Error("Level must be Distributor, City, or Region.");
  if (!entity_id) throw new Error("Select the target entity.");
  return { period_month: monthRaw.length === 7 ? `${monthRaw}-01` : monthRaw, level, entity_id };
}

/** Coverage target upsert (Customer Coverage). Admin-only. */
export async function upsertCoverageTarget(fd: FormData) {
  const { supabase, companyId } = await ctx();
  const id = str(fd, "id");
  const { period_month, level, entity_id } = validLevelEntity(fd);
  const base = {
    company_id: companyId,
    period_month,
    level: level as "agent" | "region" | "city",
    channel_id: str(fd, "channel_id"),
    ...entityIds(level, entity_id),
    required_customer_universe: numN(fd, "required_customer_universe"),
    required_active_customers: numN(fd, "required_active_customers"),
    required_coverage_pct: numN(fd, "required_coverage_pct"),
    required_productive_pct: numN(fd, "required_productive_pct"),
    required_visits: numN(fd, "required_visits"),
  };
  if (id) await supabase.from("coverage_target").update(base).eq("id", id);
  else await supabase.from("coverage_target").insert(base);
  revalidatePath("/sla-targets");
  revalidatePath("/sla-report");
}

export async function deleteCoverageTarget(fd: FormData) {
  const { supabase } = await ctx();
  const id = str(fd, "id");
  if (id) await supabase.from("coverage_target").delete().eq("id", id);
  revalidatePath("/sla-targets");
  revalidatePath("/sla-report");
}

/** Capability setup upsert (Sales-Force / Service Capability). Admin-only. */
export async function upsertCapability(fd: FormData) {
  const { supabase, companyId } = await ctx();
  const id = str(fd, "id");
  const { period_month, level, entity_id } = validLevelEntity(fd);
  const bool = (k: string) => fd.get(k) === "on";
  const base = {
    company_id: companyId,
    period_month,
    level: level as "agent" | "region" | "city",
    ...entityIds(level, entity_id),
    required_salesmen: numN(fd, "required_salesmen"),
    actual_salesmen: numN(fd, "actual_salesmen"),
    warehouse_required: bool("warehouse_required"),
    warehouse_available: bool("warehouse_available"),
    cashvan_required: bool("cashvan_required"),
    cashvan_available: bool("cashvan_available"),
    supervisor_required: bool("supervisor_required"),
    supervisor_available: bool("supervisor_available"),
    notes: str(fd, "notes"),
  };
  if (id) await supabase.from("capability_setup").update(base).eq("id", id);
  else await supabase.from("capability_setup").insert(base);
  revalidatePath("/sla-targets");
  revalidatePath("/sla-report");
}

export async function deleteCapability(fd: FormData) {
  const { supabase } = await ctx();
  const id = str(fd, "id");
  if (id) await supabase.from("capability_setup").delete().eq("id", id);
  revalidatePath("/sla-targets");
  revalidatePath("/sla-report");
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
