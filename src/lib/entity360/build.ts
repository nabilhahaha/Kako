// ============================================================================
// Entity 360 Platform — view builder (Phase 7). Pure. Assembles an entity's 360
// view: take the profile's panels and filter them by the role's Entity-360 section
// security (REUSES role-governance `visibleSections`). Returns only the panels the
// viewer may see — exports/dashboards honor the same filter. No I/O.
// ============================================================================

import { visibleSections, type SectionRule } from '@/lib/role-governance';
import { getProfile } from './registry';
import type { Entity360Panel, Entity360Type } from './types';

export interface Entity360View {
  entity: Entity360Type;
  entityId: string;
  label: string;
  panels: Entity360Panel[];   // only the visible ones
}

/**
 * Build a role-filtered 360 view. A panel is visible when a section rule grants
 * it to one of the viewer's roles; with no rule, the panel's `defaultVisible`
 * applies (conservative). Pure.
 */
export function build360(
  entity: Entity360Type,
  entityId: string,
  roles: readonly string[],
  sectionRules: readonly SectionRule[],
): Entity360View | null {
  const profile = getProfile(entity);
  if (!profile) return null;
  const granted = new Set(visibleSections(sectionRules, roles, entity));
  const hasRulesFor = (section: string) => sectionRules.some((r) => r.entity === entity && r.section === section);
  const panels = profile.panels.filter((p) => (hasRulesFor(p.key) ? granted.has(p.key) : p.defaultVisible));
  return { entity, entityId, label: profile.label, panels };
}

/** The visible panel keys only (for export/section gating). Pure. */
export function visiblePanelKeys(view: Entity360View): string[] {
  return view.panels.map((p) => p.key);
}
