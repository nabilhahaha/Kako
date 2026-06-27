import { requireProfile, isAdminRole } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { Card } from "@/components/ui/card";
import { Eye } from "lucide-react";
import { TargetDialog } from "@/components/app/sla/target-dialog";
import { upsertTarget, deleteTarget } from "@/lib/org";

const SAR = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n) + " SAR";

export default async function SlaTargetsPage() {
  const { profile } = await requireProfile();
  const isAdmin = isAdminRole(profile!.role);
  const supabase = await createClient();

  const [regionsRes, distsRes, channelsRes, targetsRes] = await Promise.all([
    supabase.from("region").select("id,name").order("name"),
    supabase.from("agent").select("id,name,code").eq("type", "distributor").order("name"),
    supabase.from("channel").select("id,name").eq("is_active", true).order("name"),
    supabase
      .from("sla_target")
      .select("id,period_month,level,target_amount,working_days,region_id,agent_id,channel_id,region:region_id(name),agent:agent_id(name),channel:channel_id(name)")
      .order("period_month", { ascending: false }),
  ]);

  const opt = (rows: { id: string; name: string }[] | null) => (rows ?? []).map((r) => ({ value: r.id, label: r.name }));
  const regions = opt(regionsRes.data);
  const distributors = (distsRes.data ?? []).map((d) => ({ value: d.id, label: `${d.name} (${d.code})` }));
  const channels = opt(channelsRes.data);
  const targets = (targetsRes.data ?? []) as unknown as Record<string, unknown>[];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">SLA Targets</h1>
          <p className="text-sm text-muted">Monthly sales targets by Distributor or Region, optionally per channel.</p>
        </div>
        {isAdmin ? (
          <TargetDialog distributors={distributors} regions={regions} channels={channels} action={upsertTarget} />
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-muted">
            <Eye className="h-3.5 w-3.5" /> View only
          </span>
        )}
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-cream-deep/40 text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5 font-semibold">Month</th>
              <th className="px-4 py-2.5 font-semibold">Level</th>
              <th className="px-4 py-2.5 font-semibold">Entity</th>
              <th className="px-4 py-2.5 font-semibold">Channel</th>
              <th className="px-4 py-2.5 font-semibold">Working days</th>
              <th className="px-4 py-2.5 text-right font-semibold">Target</th>
              {isAdmin && <th className="px-4 py-2.5 text-right font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {targets.length === 0 ? (
              <tr><td colSpan={isAdmin ? 7 : 6} className="px-4 py-12 text-center text-sm text-muted">No targets set yet.</td></tr>
            ) : (
              targets.map((t) => {
                const level = String(t.level);
                const entity = level === "region" ? rel(t.region) : rel(t.agent);
                return (
                  <tr key={String(t.id)} className="border-b border-line/60 last:border-0 hover:bg-cream/40">
                    <td className="px-4 py-2.5 text-ink">{String(t.period_month).slice(0, 7)}</td>
                    <td className="px-4 py-2.5 capitalize text-muted">{level === "agent" ? "Distributor" : level}</td>
                    <td className="px-4 py-2.5 font-medium text-ink">{entity?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted">{rel(t.channel)?.name ?? "All"}</td>
                    <td className="px-4 py-2.5 text-muted">{t.working_days != null ? String(t.working_days) : "—"}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-ink">{SAR(Number(t.target_amount ?? 0))}</td>
                    {isAdmin && (
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <TargetDialog
                            mode="edit"
                            distributors={distributors}
                            regions={regions}
                            channels={channels}
                            action={upsertTarget}
                            initial={{
                              id: String(t.id),
                              period_month: String(t.period_month),
                              level,
                              entity_id: level === "region" ? (t.region_id as string) : (t.agent_id as string),
                              channel_id: (t.channel_id as string) ?? "",
                              target_amount: String(t.target_amount ?? ""),
                              working_days: t.working_days != null ? String(t.working_days) : "",
                            }}
                          />
                          <form action={deleteTarget}>
                            <input type="hidden" name="id" value={String(t.id)} />
                            <button className="rounded-lg px-2 py-1 text-xs text-roshen-red hover:bg-roshen-red/10">Delete</button>
                          </form>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function rel(v: unknown) {
  return (Array.isArray(v) ? v[0] : v) as { name?: string } | null;
}
