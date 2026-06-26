import { requireProfile, isGlobalRole } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { HomeView } from "@/components/app/home-view";

export default async function HomePage() {
  const { user, profile } = await requireProfile();
  const supabase = await createClient();
  const global = isGlobalRole(profile!.role);

  const headCount = (t: "region" | "area" | "branch" | "agent") =>
    supabase.from(t).select("id", { count: "exact", head: true });

  const [regions, areas, branches, agents, importedBatches, mappingVersions, scopes] =
    await Promise.all([
      headCount("region"),
      headCount("area"),
      headCount("branch"),
      headCount("agent"),
      supabase.from("import_batch").select("id", { count: "exact", head: true }).eq("status", "imported"),
      supabase.from("column_mapping_version").select("id", { count: "exact", head: true }),
      supabase.from("user_scope").select("area_id").eq("user_id", user.id),
    ]);

  const scopeRows = [
    { label: "Regions", count: regions.count ?? 0 },
    { label: "Areas", count: areas.count ?? 0 },
    { label: "Branches", count: branches.count ?? 0 },
    { label: "Agents", count: agents.count ?? 0 },
  ];
  const steps = [
    { label: "Create regions", done: (regions.count ?? 0) > 0 },
    { label: "Assign agents", done: (agents.count ?? 0) > 0 },
    { label: "Upload raw data", done: (importedBatches.count ?? 0) > 0 },
    { label: "Configure mapping", done: (mappingVersions.count ?? 0) > 0 },
  ];

  return (
    <HomeView
      global={global}
      assignedAreas={scopes.data?.length ?? 0}
      scopeRows={scopeRows}
      steps={steps}
    />
  );
}
