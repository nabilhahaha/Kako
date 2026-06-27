"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireProfile, isAdminRole } from "@/lib/auth";

const SETUP_PATH = "/app/targets";

/** Admin-only context for every SLA & Coverage setup write. */
async function ctx() {
  const { profile } = await requireProfile();
  if (!isAdminRole(profile?.role)) {
    throw new Error("Only an Admin can create or edit SLA & Coverage setup.");
  }
  const supabase = await createClient();
  return { supabase, companyId: profile!.company_id!, userId: profile!.id };
}

const str = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};

const num = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const bool = (fd: FormData, k: string) => fd.get(k) === "on";

/** Normalize a month input ("2026-06" or "2026-06-15") to the first of month. */
function periodMonth(fd: FormData): string {
  const raw = str(fd, "period_month");
  if (!raw) throw new Error("Period (month) is required.");
  const m = /^(\d{4})-(\d{2})/.exec(raw);
  if (!m) throw new Error("Period must be a valid month.");
  return `${m[1]}-${m[2]}-01`;
}

type Level = "region" | "city" | "area" | "agent";

/** Resolve the entity column + id for a given level from the form. */
function entityFor(fd: FormData, level: Level, allowed: Level[]) {
  if (!allowed.includes(level)) throw new Error(`Unsupported level: ${level}`);
  const col = `${level}_id` as const;
  const id = str(fd, col);
  if (!id) throw new Error(`Please choose ${level === "city" ? "a city" : `a ${level}`}.`);
  return { col, id };
}

/** Build the {region_id, city_id, area_id, agent_id} payload with only the chosen level set. */
function scopePayload(level: Level, col: string, id: string) {
  return {
    region_id: col === "region_id" ? id : null,
    city_id: col === "city_id" ? id : null,
    area_id: col === "area_id" ? id : null,
    agent_id: col === "agent_id" ? id : null,
  };
}

// ---------------------------------------------------------------------
// Sales Targets (sla_target) — levels: region / area / agent (× channel)
// ---------------------------------------------------------------------
export async function upsertSalesTarget(fd: FormData) {
  const { supabase, companyId, userId } = await ctx();
  const id = str(fd, "id");
  const level = (str(fd, "level") ?? "agent") as Level;
  const { col, id: entId } = entityFor(fd, level, ["region", "area", "agent"]);
  const scope = scopePayload(level, col, entId);
  const channel_id = str(fd, "channel_id");
  const target_amount = num(fd, "target_amount") ?? 0;
  const target_qty = num(fd, "target_qty");
  const working_days = num(fd, "working_days");
  const period_month = periodMonth(fd);

  const row = {
    company_id: companyId,
    period_month,
    level,
    country_id: null,
    branch_id: null,
    region_id: scope.region_id,
    area_id: scope.area_id,
    agent_id: scope.agent_id,
    channel_id,
    target_amount,
    target_qty,
    working_days,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { error } = await supabase.from("sla_target").update(row).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    // Find-or-update on the natural grain so re-entry edits instead of failing the unique index.
    let q = supabase
      .from("sla_target")
      .select("id")
      .eq("period_month", period_month)
      .eq("level", level)
      .eq(col as "region_id" | "area_id" | "agent_id", entId);
    q = channel_id ? q.eq("channel_id", channel_id) : q.is("channel_id", null);
    const { data: existing } = await q.maybeSingle();
    if (existing) {
      const { error } = await supabase.from("sla_target").update(row).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("sla_target").insert({ ...row, created_by: userId });
      if (error) throw new Error(error.message);
    }
  }
  revalidatePath(SETUP_PATH);
}

export async function deleteSalesTarget(fd: FormData) {
  const { supabase } = await ctx();
  const id = str(fd, "id");
  if (!id) return;
  const { error } = await supabase.from("sla_target").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(SETUP_PATH);
}

// ---------------------------------------------------------------------
// Coverage Targets (coverage_target) — levels: region / city / agent (× channel)
// ---------------------------------------------------------------------
export async function upsertCoverageTarget(fd: FormData) {
  const { supabase, companyId, userId } = await ctx();
  const id = str(fd, "id");
  const level = (str(fd, "level") ?? "agent") as Level;
  const { col, id: entId } = entityFor(fd, level, ["region", "city", "agent"]);
  const scope = scopePayload(level, col, entId);
  const channel_id = str(fd, "channel_id");
  const period_month = periodMonth(fd);

  const row = {
    company_id: companyId,
    period_month,
    level,
    region_id: scope.region_id,
    city_id: scope.city_id,
    agent_id: scope.agent_id,
    channel_id,
    required_customer_universe: num(fd, "required_customer_universe"),
    required_active_customers: num(fd, "required_active_customers"),
    required_coverage_pct: num(fd, "required_coverage_pct"),
    required_productive_pct: num(fd, "required_productive_pct"),
    required_visits: num(fd, "required_visits"),
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { error } = await supabase.from("coverage_target").update(row).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    let q = supabase
      .from("coverage_target")
      .select("id")
      .eq("period_month", period_month)
      .eq("level", level)
      .eq(col as "region_id" | "city_id" | "agent_id", entId);
    q = channel_id ? q.eq("channel_id", channel_id) : q.is("channel_id", null);
    const { data: existing } = await q.maybeSingle();
    if (existing) {
      const { error } = await supabase.from("coverage_target").update(row).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("coverage_target").insert({ ...row, created_by: userId });
      if (error) throw new Error(error.message);
    }
  }
  revalidatePath(SETUP_PATH);
}

export async function deleteCoverageTarget(fd: FormData) {
  const { supabase } = await ctx();
  const id = str(fd, "id");
  if (!id) return;
  const { error } = await supabase.from("coverage_target").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(SETUP_PATH);
}

// ---------------------------------------------------------------------
// Capability Setup (capability_setup) — levels: region / city / agent
// ---------------------------------------------------------------------
export async function upsertCapability(fd: FormData) {
  const { supabase, companyId, userId } = await ctx();
  const id = str(fd, "id");
  const level = (str(fd, "level") ?? "agent") as Level;
  const { col, id: entId } = entityFor(fd, level, ["region", "city", "agent"]);
  const scope = scopePayload(level, col, entId);
  const period_month = periodMonth(fd);

  const row = {
    company_id: companyId,
    period_month,
    level,
    region_id: scope.region_id,
    city_id: scope.city_id,
    agent_id: scope.agent_id,
    required_salesmen: num(fd, "required_salesmen"),
    actual_salesmen: num(fd, "actual_salesmen"),
    warehouse_required: bool(fd, "warehouse_required"),
    warehouse_available: bool(fd, "warehouse_available"),
    cashvan_required: bool(fd, "cashvan_required"),
    cashvan_available: bool(fd, "cashvan_available"),
    supervisor_required: bool(fd, "supervisor_required"),
    supervisor_available: bool(fd, "supervisor_available"),
    notes: str(fd, "notes"),
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { error } = await supabase.from("capability_setup").update(row).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { data: existing } = await supabase
      .from("capability_setup")
      .select("id")
      .eq("period_month", period_month)
      .eq("level", level)
      .eq(col as "region_id" | "city_id" | "agent_id", entId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase.from("capability_setup").update(row).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("capability_setup").insert({ ...row, created_by: userId });
      if (error) throw new Error(error.message);
    }
  }
  revalidatePath(SETUP_PATH);
}

export async function deleteCapability(fd: FormData) {
  const { supabase } = await ctx();
  const id = str(fd, "id");
  if (!id) return;
  const { error } = await supabase.from("capability_setup").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(SETUP_PATH);
}
