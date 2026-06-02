'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n/provider';
import { PERMISSION_LABELS, type Permission } from '@/lib/erp/permissions';
import type { AdminField, FieldGovernanceAdmin } from '@/lib/erp/field-governance-server';
import {
  setFieldConfig, setFieldAccess, clearFieldAccess,
  setFieldSection, deleteFieldSection, reorderFieldSections, reorderFields,
} from './actions';
import {
  Briefcase, DollarSign, Scale, Phone, MapPin, CreditCard, Tag, User, Building2,
  FileText, Truck, Package, ChevronUp, ChevronDown, Plus, Trash2, ShieldAlert,
} from 'lucide-react';

type Section = Record<string, unknown> & { key: string };
type AccessLevel = 'hidden' | 'view' | 'edit' | 'required';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Briefcase, DollarSign, Scale, Phone, MapPin, CreditCard, Tag, User, Building2, FileText, Truck, Package,
};
const ICON_NAMES = Object.keys(ICONS);

const selectCls = 'h-9 text-sm';

export function FieldGovernanceManager({
  entities,
  admin,
}: {
  entities: { key: string; labelAr: string; labelEn: string }[];
  admin: FieldGovernanceAdmin;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const ar = locale === 'ar';
  const [pending, startTransition] = useTransition();
  const [fields, setFields] = useState<AdminField[]>(admin.fields);
  const [sections, setSections] = useState<Section[]>(admin.sections as Section[]);
  const [openAccess, setOpenAccess] = useState<string | null>(null);
  const [newSection, setNewSection] = useState('');
  const entity = admin.entity;

  // Run a server action, toast result (mapping lockout codes), then apply onOk.
  function run(action: () => Promise<{ ok: boolean; error?: string }>, onOk: () => void) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        const e = res.error ?? '';
        toast.error(e.startsWith('protected_') || e.startsWith('cannot_hide') ? t('fieldGov.lockoutBlocked') : t('fieldGov.error'));
        return;
      }
      onOk();
      toast.success(t('fieldGov.saved'));
    });
  }

  const ACCESS_OPTS: { v: string; label: string }[] = [
    { v: 'inherit', label: t('fieldGov.accessInherit') },
    { v: 'hidden', label: t('fieldGov.accessHidden') },
    { v: 'view', label: t('fieldGov.accessView') },
    { v: 'edit', label: t('fieldGov.accessEdit') },
    { v: 'required', label: t('fieldGov.accessRequired') },
  ];
  const fieldLabel = (f: AdminField) => (ar ? f.labelAr : f.labelEn) || f.key;
  const cfg = (f: AdminField, k: string) => (f.config?.[k] as unknown);

  // ── Field config helpers (immediate persistence + local state) ─────────────
  function patchConfig(f: AdminField, patch: Record<string, unknown>) {
    run(() => setFieldConfig(entity, f.key, f.source, patch), () => {
      setFields((prev) => prev.map((x) => (x.key === f.key ? { ...x, config: { ...(x.config ?? {}), ...patch } } : x)));
    });
  }
  function moveField(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[idx], next[j]] = [next[j], next[idx]];
    setFields(next);
    run(() => reorderFields(entity, next.map((f) => ({ key: f.key, source: f.source }))), () => {});
  }

  // ── Access matrix helpers ──────────────────────────────────────────────────
  function accessFor(f: AdminField, type: 'role' | 'permission', key: string): string {
    return f.access.find((a) => a.subject_type === type && a.subject_key === key)?.access ?? 'inherit';
  }
  function setAccess(f: AdminField, type: 'role' | 'permission', key: string, value: string) {
    if (value === 'inherit') {
      run(() => clearFieldAccess(entity, f.key, type, key), () => updateAccessLocal(f.key, type, key, null));
    } else {
      run(() => setFieldAccess(entity, f.key, type, key, value as AccessLevel), () => updateAccessLocal(f.key, type, key, value));
    }
  }
  function updateAccessLocal(fieldKey: string, type: 'role' | 'permission', key: string, value: string | null) {
    setFields((prev) => prev.map((x) => {
      if (x.key !== fieldKey) return x;
      const rest = x.access.filter((a) => !(a.subject_type === type && a.subject_key === key));
      return { ...x, access: value ? [...rest, { subject_type: type, subject_key: key, access: value }] : rest };
    }));
  }

  // ── Section helpers ────────────────────────────────────────────────────────
  function patchSection(key: string, patch: Record<string, unknown>) {
    run(() => setFieldSection(entity, key, patch), () => {
      setSections((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
    });
  }
  function addSection() {
    const key = newSection.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!key) return;
    run(() => setFieldSection(entity, key, { sort: sections.length }), () => {
      setSections((prev) => [...prev, { key, sort: prev.length } as Section]);
      setNewSection('');
    });
  }
  function removeSection(key: string) {
    run(() => deleteFieldSection(entity, key), () => setSections((prev) => prev.filter((s) => s.key !== key)));
  }
  function moveSection(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[idx], next[j]] = [next[j], next[idx]];
    setSections(next);
    run(() => reorderFieldSections(entity, next.map((s) => s.key)), () => {});
  }

  const sectionOpts = sections.map((s) => s.key);
  const usedPerms = (f: AdminField) => new Set(f.access.filter((a) => a.subject_type === 'permission').map((a) => a.subject_key));

  return (
    <div className="space-y-6">
      {/* Entity selector */}
      <div className="flex flex-wrap items-center gap-3">
        <Label className="text-sm">{t('fieldGov.entity')}</Label>
        <div className="w-60">
          <Select value={entity} disabled={pending} onChange={(e) => router.push(`/settings/field-governance?entity=${e.target.value}`)}>
            {entities.map((en) => <option key={en.key} value={en.key}>{ar ? en.labelAr : en.labelEn}</option>)}
          </Select>
        </div>
      </div>

      {/* ── Sections ─────────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div>
            <h3 className="font-semibold">{t('fieldGov.sectionsTitle')}</h3>
            <p className="text-xs text-muted-foreground">{t('fieldGov.sectionsHint')}</p>
          </div>
          {sections.length === 0 && <p className="text-sm text-muted-foreground">{t('fieldGov.sectionEmpty')}</p>}
          <div className="space-y-3">
            {sections.map((s, i) => (
              <div key={s.key} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs" dir="ltr">{s.key}</span>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" disabled={pending || i === 0} onClick={() => moveSection(i, -1)} aria-label={t('fieldGov.moveUp')}><ChevronUp className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" disabled={pending || i === sections.length - 1} onClick={() => moveSection(i, 1)} aria-label={t('fieldGov.moveDown')}><ChevronDown className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => removeSection(s.key)} aria-label={t('fieldGov.sectionDelete')}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input placeholder={t('fieldGov.sectionLabelAr')} defaultValue={(s.label_ar as string) ?? ''} onBlur={(e) => patchSection(s.key, { label_ar: e.target.value || null })} />
                  <Input placeholder={t('fieldGov.sectionLabelEn')} defaultValue={(s.label_en as string) ?? ''} onBlur={(e) => patchSection(s.key, { label_en: e.target.value || null })} />
                  <Input placeholder={t('fieldGov.sectionDescAr')} defaultValue={(s.description_ar as string) ?? ''} onBlur={(e) => patchSection(s.key, { description_ar: e.target.value || null })} />
                  <Input placeholder={t('fieldGov.sectionDescEn')} defaultValue={(s.description_en as string) ?? ''} onBlur={(e) => patchSection(s.key, { description_en: e.target.value || null })} />
                  <div className="flex items-center gap-2">
                    <Label className="w-20 text-xs">{t('fieldGov.sectionIcon')}</Label>
                    <Select className={selectCls} defaultValue={(s.icon as string) ?? ''} onChange={(e) => patchSection(s.key, { icon: e.target.value || null })}>
                      <option value="">{t('fieldGov.iconNone')}</option>
                      {ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
                    </Select>
                    {s.icon && ICONS[s.icon as string] ? (() => { const Ic = ICONS[s.icon as string]; return <Ic className="h-4 w-4 text-muted-foreground" />; })() : null}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <label className="flex items-center gap-1.5"><input type="checkbox" defaultChecked={(s.collapsible as boolean) ?? true} onChange={(e) => patchSection(s.key, { collapsible: e.target.checked })} className="h-4 w-4" /> {t('fieldGov.sectionCollapsible')}</label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" defaultChecked={(s.default_collapsed as boolean) ?? false} onChange={(e) => patchSection(s.key, { default_collapsed: e.target.checked })} className="h-4 w-4" /> {t('fieldGov.sectionDefaultCollapsed')}</label>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input value={newSection} onChange={(e) => setNewSection(e.target.value)} placeholder={t('fieldGov.sectionKeyPlaceholder')} className="max-w-xs" dir="ltr" />
            <Button size="sm" variant="outline" disabled={pending || !newSection.trim()} onClick={addSection}><Plus className="h-4 w-4" /> {t('fieldGov.sectionAdd')}</Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Fields ───────────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div>
            <h3 className="font-semibold">{t('fieldGov.fieldsTitle')}</h3>
            <p className="text-xs text-muted-foreground">{t('fieldGov.fieldsHint')}</p>
          </div>
          <div className="divide-y rounded-md border">
            {fields.map((f, i) => (
              <div key={f.key} className="space-y-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{fieldLabel(f)}</span>
                    <span className="font-mono text-[11px] text-muted-foreground" dir="ltr">{f.key}</span>
                  </span>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant="secondary">{f.source === 'custom' ? t('fieldGov.badgeCustom') : t('fieldGov.badgeCore')}</Badge>
                    {f.isProtected && <Badge variant="warning" className="gap-1"><ShieldAlert className="h-3 w-3" /> {t('fieldGov.badgeProtected')}</Badge>}
                    <Button size="sm" variant="ghost" disabled={pending || i === 0} onClick={() => moveField(i, -1)} aria-label={t('fieldGov.moveUp')}><ChevronUp className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" disabled={pending || i === fields.length - 1} onClick={() => moveField(i, 1)} aria-label={t('fieldGov.moveDown')}><ChevronDown className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">{t('fieldGov.colSection')}</Label>
                    <Select className={selectCls} defaultValue={(cfg(f, 'section') as string) ?? ''} onChange={(e) => patchConfig(f, { section: e.target.value || null })}>
                      <option value="">{t('fieldGov.noneOption')}</option>
                      {sectionOpts.map((k) => <option key={k} value={k}>{k}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">{t('fieldGov.colDefaultAccess')}</Label>
                    <Select className={selectCls} defaultValue={(cfg(f, 'default_access') as string) ?? 'edit'} onChange={(e) => patchConfig(f, { default_access: e.target.value })}>
                      {ACCESS_OPTS.filter((o) => o.v !== 'inherit').map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                    </Select>
                  </div>
                  <label className="flex items-center gap-1.5 self-end text-sm">
                    <input type="checkbox" defaultChecked={(cfg(f, 'is_active') as boolean) ?? true} onChange={(e) => patchConfig(f, { is_active: e.target.checked })} className="h-4 w-4" /> {t('fieldGov.colActive')}
                  </label>
                  <label className="flex items-center gap-1.5 self-end text-sm">
                    <input type="checkbox" defaultChecked={(cfg(f, 'is_sensitive') as boolean) ?? false} onChange={(e) => patchConfig(f, { is_sensitive: e.target.checked })} className="h-4 w-4" /> {t('fieldGov.colSensitive')}
                  </label>
                </div>
                <Button size="sm" variant="outline" onClick={() => setOpenAccess(openAccess === f.key ? null : f.key)}>
                  {t('fieldGov.accessBtn')}
                </Button>
                {openAccess === f.key && (
                  <div className="space-y-3 rounded-md border bg-secondary/20 p-3">
                    <p className="text-xs font-medium text-muted-foreground">{t('fieldGov.accessByRole')}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {admin.roles.map((r) => (
                        <div key={r.key} className="flex items-center gap-2">
                          <span className="w-32 truncate text-sm" title={r.key}>{ar ? r.name_ar || r.key : r.key}</span>
                          <Select className={selectCls} value={accessFor(f, 'role', r.key)} onChange={(e) => setAccess(f, 'role', r.key, e.target.value)}>
                            {ACCESS_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                          </Select>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs font-medium text-muted-foreground">{t('fieldGov.accessByPermission')}</p>
                    {f.access.filter((a) => a.subject_type === 'permission').map((a) => (
                      <div key={a.subject_key} className="flex items-center gap-2">
                        <span className="w-40 truncate text-sm" dir="ltr" title={a.subject_key}>{a.subject_key}</span>
                        <Select className={selectCls} value={a.access} onChange={(e) => setAccess(f, 'permission', a.subject_key, e.target.value)}>
                          {ACCESS_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                        </Select>
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <Select className={`${selectCls} max-w-xs`} value="" onChange={(e) => { if (e.target.value) setAccess(f, 'permission', e.target.value, 'view'); }}>
                        <option value="">{t('fieldGov.selectPermission')}</option>
                        {(Object.keys(PERMISSION_LABELS) as Permission[]).filter((p) => !usedPerms(f).has(p)).map((p) => (
                          <option key={p} value={p}>{ar ? PERMISSION_LABELS[p].ar : PERMISSION_LABELS[p].en}</option>
                        ))}
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
