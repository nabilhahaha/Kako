'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { PERMISSION_LABELS, type Permission } from '@/lib/erp/permissions';
import { DENY_ALL_CAPABILITIES, GRANULAR_CAPABILITY_LABELS } from '@/lib/erp/granular-capabilities';
import { setFieldSectionAccess, removeFieldSectionAccess } from '../field-governance/actions';
import { loadSectionAccess, type SectionAccessData } from './actions';

type SubjectType = 'role' | 'permission' | 'capability';
type AccessLevel = 'hidden' | 'view';
type Row = { section_key: string; subject_type: string; subject_key: string; access: string };

/** D. Section Access (P5) — restrict whole sections by role/permission/capability.
 *  REUSES setFieldSectionAccess / removeFieldSectionAccess from field-governance. */
export function SectionAccessPanel({
  entities,
}: {
  entities: { key: string; labelAr: string; labelEn: string }[];
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const ar = locale === 'ar';
  const [pending, startTransition] = useTransition();
  const [entity, setEntity] = useState(entities[0]?.key ?? '');
  const [data, setData] = useState<SectionAccessData | null>(null);
  const [loading, setLoading] = useState(false);

  // Add-rule working state, keyed by section.
  const [draft, setDraft] = useState<Record<string, { subjectType: SubjectType; subjectKey: string; access: AccessLevel }>>({});

  useEffect(() => {
    if (!entity) return;
    let active = true;
    setLoading(true);
    loadSectionAccess(entity).then((res) => {
      if (!active) return;
      if (res.ok && res.data) setData(res.data);
      else { toast.error(t('authz.error')); setData(null); }
      setLoading(false);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  function reload() {
    loadSectionAccess(entity).then((res) => { if (res.ok && res.data) setData(res.data); });
  }

  function subjectOptions(type: SubjectType): { id: string; name: string }[] {
    if (type === 'role') return (data?.roles ?? []).map((r) => ({ id: r.key, name: ar ? r.name_ar || r.key : r.key }));
    if (type === 'permission')
      return (Object.keys(PERMISSION_LABELS) as Permission[]).map((p) => ({ id: p, name: ar ? PERMISSION_LABELS[p].ar : PERMISSION_LABELS[p].en }));
    return DENY_ALL_CAPABILITIES.map((c) => ({ id: c, name: ar ? GRANULAR_CAPABILITY_LABELS[c].ar : GRANULAR_CAPABILITY_LABELS[c].en }));
  }

  function workingFor(sectionKey: string) {
    return draft[sectionKey] ?? { subjectType: 'role' as SubjectType, subjectKey: '', access: 'view' as AccessLevel };
  }
  function updateDraft(sectionKey: string, patch: Partial<{ subjectType: SubjectType; subjectKey: string; access: AccessLevel }>) {
    setDraft((prev) => ({ ...prev, [sectionKey]: { ...workingFor(sectionKey), ...patch } }));
  }

  function add(sectionKey: string) {
    const w = workingFor(sectionKey);
    if (!w.subjectKey) return;
    startTransition(async () => {
      const res = await setFieldSectionAccess(entity, sectionKey, w.subjectType, w.subjectKey, w.access);
      if (!res.ok) { toast.error(t('authz.error')); return; }
      toast.success(t('authz.saved'));
      setDraft((prev) => ({ ...prev, [sectionKey]: { subjectType: 'role', subjectKey: '', access: 'view' } }));
      reload();
      router.refresh();
    });
  }
  function remove(sectionKey: string, r: Row) {
    startTransition(async () => {
      const res = await removeFieldSectionAccess(entity, sectionKey, r.subject_type as SubjectType, r.subject_key);
      if (!res.ok) { toast.error(t('authz.error')); return; }
      toast.success(t('authz.saved'));
      reload();
      router.refresh();
    });
  }

  function rowsFor(sectionKey: string): Row[] {
    return (data?.sectionAccess ?? []).filter((r) => r.section_key === sectionKey);
  }
  function subjectLabel(r: Row): string {
    if (r.subject_type === 'role') return ar ? (data?.roles.find((x) => x.key === r.subject_key)?.name_ar || r.subject_key) : r.subject_key;
    if (r.subject_type === 'permission' && r.subject_key in PERMISSION_LABELS)
      return ar ? PERMISSION_LABELS[r.subject_key as Permission].ar : PERMISSION_LABELS[r.subject_key as Permission].en;
    if (r.subject_type === 'capability' && (DENY_ALL_CAPABILITIES as readonly string[]).includes(r.subject_key))
      return ar ? GRANULAR_CAPABILITY_LABELS[r.subject_key as typeof DENY_ALL_CAPABILITIES[number]].ar : GRANULAR_CAPABILITY_LABELS[r.subject_key as typeof DENY_ALL_CAPABILITIES[number]].en;
    return r.subject_key;
  }

  const sectionLabel = (s: Record<string, unknown>) =>
    (ar ? (s.label_ar as string) : (s.label_en as string)) || (s.key as string);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">{t('authz.sectionsTitle')}</h3>
        <p className="text-xs text-muted-foreground">{t('authz.sectionsHint')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm">{t('authz.sectionsEntity')}</label>
        <div className="w-52">
          <Select className="h-9 text-sm" value={entity} disabled={pending || loading} onChange={(e) => setEntity(e.target.value)}>
            {entities.map((en) => <option key={en.key} value={en.key}>{ar ? en.labelAr : en.labelEn}</option>)}
          </Select>
        </div>
      </div>

      {!data || (data.sections.length === 0) ? (
        <p className="text-sm text-muted-foreground">{t('authz.sectionsNoSections')}</p>
      ) : (
        <div className="space-y-3">
          {data.sections.map((s) => {
            const key = s.key as string;
            const rows = rowsFor(key);
            const w = workingFor(key);
            return (
              <Card key={key}>
                <CardContent className="space-y-3 pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {sectionLabel(s)}
                      <span className="font-mono text-[11px] text-muted-foreground" dir="ltr">{key}</span>
                    </span>
                    <Badge variant={rows.length === 0 ? 'secondary' : 'warning'}>
                      {rows.length === 0 ? t('authz.sectionsVisibleAll') : t('authz.sectionsRestricted')}
                    </Badge>
                  </div>

                  {rows.length > 0 && (
                    <div className="divide-y rounded-md border text-sm">
                      {rows.map((r) => (
                        <div key={`${r.subject_type}:${r.subject_key}`} className="flex items-center justify-between gap-2 p-2">
                          <span className="flex items-center gap-2">
                            <Badge variant="outline">{t(`authz.sectionsSubjectType${r.subject_type === 'role' ? 'Role' : r.subject_type === 'permission' ? 'Permission' : 'Capability'}`)}</Badge>
                            <span>{subjectLabel(r)}</span>
                            <Badge variant={r.access === 'view' ? 'success' : 'secondary'}>
                              {r.access === 'view' ? t('authz.sectionsAccessView') : t('authz.sectionsAccessHidden')}
                            </Badge>
                          </span>
                          <button type="button" disabled={pending} onClick={() => remove(key, r)} className="text-destructive hover:opacity-70" aria-label={t('authz.remove')}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <Select className="h-9 text-sm" value={w.subjectType} disabled={pending} onChange={(e) => updateDraft(key, { subjectType: e.target.value as SubjectType, subjectKey: '' })}>
                      <option value="role">{t('authz.sectionsSubjectTypeRole')}</option>
                      <option value="permission">{t('authz.sectionsSubjectTypePermission')}</option>
                      <option value="capability">{t('authz.sectionsSubjectTypeCapability')}</option>
                    </Select>
                    <Select className="h-9 text-sm sm:col-span-2 lg:col-span-1" value={w.subjectKey} disabled={pending} onChange={(e) => updateDraft(key, { subjectKey: e.target.value })}>
                      <option value="">{t('authz.sectionsSubject')}</option>
                      {subjectOptions(w.subjectType).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </Select>
                    <Select className="h-9 text-sm" value={w.access} disabled={pending} onChange={(e) => updateDraft(key, { access: e.target.value as AccessLevel })}>
                      <option value="view">{t('authz.sectionsAccessView')}</option>
                      <option value="hidden">{t('authz.sectionsAccessHidden')}</option>
                    </Select>
                    <div className="flex items-end">
                      <Button size="sm" disabled={pending || !w.subjectKey} onClick={() => add(key)}>{t('authz.sectionsAddRule')}</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
