import { useQuery } from '@tanstack/react-query';
import { enqueue } from '@/lib/sync';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/stores/session';
import { uuid } from '@/lib/uuid';

interface VisitContext {
  visitId: string;
  customerId: string | null;
}

function scope() {
  const p = useSession.getState().profile;
  return { area_id: p?.areaId ?? null, region_id: p?.regionId ?? null, userId: p?.userId };
}

export async function createOpportunity(
  ctx: VisitContext,
  data: { title: string; estimated_value: number | null; priority: string },
) {
  const s = scope();
  const id = uuid();
  await enqueue('opportunities', 'insert', {
    id,
    visit_id: ctx.visitId,
    customer_id: ctx.customerId,
    title: data.title,
    estimated_value: data.estimated_value,
    priority: data.priority,
    status: 'open',
    owner_id: s.userId,
    created_by: s.userId,
    area_id: s.area_id,
    region_id: s.region_id,
  });
}

export async function createIssue(
  ctx: VisitContext,
  data: { issue_type: string; severity: string; title: string },
) {
  const s = scope();
  await enqueue('issues', 'insert', {
    id: uuid(),
    visit_id: ctx.visitId,
    customer_id: ctx.customerId,
    issue_type: data.issue_type,
    severity: data.severity,
    title: data.title,
    status: 'open',
    owner_id: s.userId,
    area_id: s.area_id,
    region_id: s.region_id,
  });
}

export async function createAction(ctx: VisitContext, data: { description: string; target_date: string | null }) {
  const s = scope();
  await enqueue('action_plans', 'insert', {
    id: uuid(),
    visit_id: ctx.visitId,
    description: data.description,
    target_date: data.target_date,
    responsible_id: s.userId,
    status: 'not_started',
  });
}

export async function createFollowUp(
  ctx: VisitContext,
  data: { title: string; type: string; due_date: string | null },
) {
  const s = scope();
  await enqueue('follow_ups', 'insert', {
    id: uuid(),
    visit_id: ctx.visitId,
    customer_id: ctx.customerId,
    title: data.title,
    type: data.type,
    due_date: data.due_date,
    assigned_to: s.userId,
    status: 'scheduled',
    area_id: s.area_id,
    region_id: s.region_id,
  });
}

// ---- DVAP (framework-driven) ------------------------------------------
export interface FrameworkDimension {
  id: string;
  key: string;
  label: string;
  weight: number;
}
export interface FrameworkBand {
  key: string;
  min_score: number;
  max_score: number;
}
export interface DvapFramework {
  frameworkId: string;
  dimensions: FrameworkDimension[];
  bands: FrameworkBand[];
}

// Loads the active default DVAP (assessment) framework + its dimensions/bands.
export function useDvapFramework() {
  return useQuery({
    queryKey: ['framework', 'dvap'],
    queryFn: async (): Promise<DvapFramework | null> => {
      if (!supabase) return null;
      const { data: fw } = await supabase
        .from('frameworks')
        .select('id')
        .eq('kind', 'assessment')
        .eq('is_default', true)
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!fw) return null;
      const [{ data: dims }, { data: bands }] = await Promise.all([
        supabase.from('framework_dimensions').select('id, key, label, weight').eq('framework_id', fw.id).order('sort'),
        supabase.from('framework_bands').select('key, min_score, max_score').eq('framework_id', fw.id).order('min_score'),
      ]);
      return {
        frameworkId: fw.id,
        dimensions: (dims ?? []).map((d) => ({ ...d, weight: Number(d.weight) })),
        bands: (bands ?? []).map((b) => ({ key: b.key, min_score: Number(b.min_score), max_score: Number(b.max_score) })),
      };
    },
  });
}

// Compute the weighted overall + band on the client (mirrors fi_recompute_assessment)
// so the result is immediate and works offline.
export function computeOverall(fw: DvapFramework, scores: Record<string, number>) {
  let acc = 0;
  let wsum = 0;
  for (const d of fw.dimensions) {
    const v = scores[d.key];
    if (v != null) {
      acc += v * d.weight;
      wsum += d.weight;
    }
  }
  const overall = wsum > 0 ? Math.round((acc / wsum) * 100) / 100 : null;
  let band: string | null = null;
  if (overall != null) {
    const hit = [...fw.bands].sort((a, b) => b.min_score - a.min_score).find((b) => overall >= b.min_score && overall <= b.max_score);
    band = hit?.key ?? null;
  }
  return { overall, band };
}

export async function saveDvap(
  ctx: VisitContext,
  fw: DvapFramework,
  scores: Record<string, number>,
) {
  const s = scope();
  const assessmentId = uuid();
  const { overall, band } = computeOverall(fw, scores);
  await enqueue('assessments', 'insert', {
    id: assessmentId,
    framework_id: fw.frameworkId,
    visit_id: ctx.visitId,
    customer_id: ctx.customerId,
    overall_score: overall,
    band_key: band,
    area_id: s.area_id,
    region_id: s.region_id,
  });
  for (const d of fw.dimensions) {
    if (scores[d.key] == null) continue;
    await enqueue('assessment_scores', 'insert', {
      id: uuid(),
      assessment_id: assessmentId,
      dimension_id: d.id,
      dimension_key: d.key,
      score: scores[d.key],
    });
  }
  return { overall, band };
}
