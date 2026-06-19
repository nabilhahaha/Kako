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
import { resolveAccess, type AccessLevel as ResolvedLevel } from '@/lib/erp/field-governance';
import type { AdminField, FieldGovernanceAdmin } from '@/lib/erp/field-governance-server';
import {
  setFieldConfig, setFieldAccess, clearFieldAccess,
  setFieldSection, deleteFieldSection, reorderFieldSections, reorderFields,
  bulkSetFieldConfig, resetEntityGovernance, exportFieldGovernance, importFieldGovernance,
  copyEntityConfig, saveAsTemplate, applyTemplate, getFieldGovernanceHistory,
  publishFieldGovernance, rollbackToVersion, applyCustomerGovernanceBaseline,
} from './actions';
import {
  Briefcase, DollarSign, Scale, Phone, MapPin, CreditCard, Tag, User, Building2,
  FileText, Truck, Package, ChevronUp, ChevronDown, Plus, Trash2, ShieldAlert,
  Search, Download, Upload, RotateCcw, Eye,
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
  isPlatformOwner,
}: {
  entities: { key: string; labelAr: string; labelEn: string }[];
  admin: FieldGovernanceAdmin;
  isPlatformOwner: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const ar = locale === 'ar';
  const [pending, startTransition] = useTransition();
  const [fields, setFields] = useState<AdminField[]>(admin.fields);
  const [sections, setSections] = useState<Section[]>(admin.sections as Section[]);
  const [openAccess, setOpenAccess] = useState<string | null>(null);
  const [newSection, setNewSection] = useState('');
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewRole, setPreviewRole] = useState('');
  const [importText, setImportText] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateGlobal, setTemplateGlobal] = useState(false);
  const [history, setHistory] = useState<Array<{ actor: string | null; action: string; field: string; at: string }> | null>(null);
  const [publishLabel, setPublishLabel] = useState('');
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
    { v: 'request', label: t('fieldGov.accessRequest') },
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
  function moveField(key: string, dir: -1 | 1) {
    const idx = fields.findIndex((f) => f.key === key);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[idx], next[j]] = [next[j], next[idx]];
    setFields(next);
    run(() => reorderFields(entity, next.map((f) => ({ key: f.key, source: f.source }))), () => {});
  }
  const filtered = search.trim() !== '' || sectionFilter !== '';

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

  // ── Search + section filter ────────────────────────────────────────────────
  const visibleFields = fields.filter((f) => {
    const q = search.trim().toLowerCase();
    if (q && !f.key.toLowerCase().includes(q) && !(f.labelAr || '').toLowerCase().includes(q) && !(f.labelEn || '').toLowerCase().includes(q)) return false;
    if (sectionFilter === '__none__') return !cfg(f, 'section');
    if (sectionFilter) return (cfg(f, 'section') as string) === sectionFilter;
    return true;
  });

  // ── Preview as a role (simulate resolved access, read-only) ─────────────────
  const ACCESS_LABEL: Record<string, string> = {
    hidden: t('fieldGov.accessHidden'), view: t('fieldGov.accessView'), request: t('fieldGov.accessRequest'), edit: t('fieldGov.accessEdit'), required: t('fieldGov.accessRequired'),
  };
  function previewAccess(f: AdminField): ResolvedLevel {
    const isAdmin = previewRole === 'admin' || previewRole === 'it_admin';
    return resolveAccess({
      defaultAccess: ((cfg(f, 'default_access') as ResolvedLevel) ?? 'edit'),
      isProtected: f.isProtected,
      isActive: (cfg(f, 'is_active') as boolean) ?? true,
      applicable: true,
      accessRows: f.access.map((a) => ({ subjectType: a.subject_type as 'role' | 'permission', subjectKey: a.subject_key, access: a.access as ResolvedLevel })),
      userRoles: [previewRole], userPermissions: [], isAdmin,
    });
  }

  // ── Bulk actions ───────────────────────────────────────────────────────────
  function toggleSelect(key: string) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }
  function bulkApply(patch: { is_active?: boolean; default_access?: ResolvedLevel }) {
    const items = fields.filter((f) => selected.has(f.key)).map((f) => ({ key: f.key, source: f.source }));
    if (items.length === 0) return;
    run(() => bulkSetFieldConfig(entity, items, patch), () => {
      setFields((prev) => prev.map((x) => (selected.has(x.key) ? { ...x, config: { ...(x.config ?? {}), ...patch } } : x)));
      setSelected(new Set());
    });
  }

  // ── Reset / export / import ─────────────────────────────────────────────────
  function resetDefaults() {
    if (!window.confirm(t('fieldGov.resetConfirm'))) return;
    run(() => resetEntityGovernance(entity), () => router.refresh());
  }
  function doExport() {
    startTransition(async () => {
      const res = await exportFieldGovernance(entity);
      if (!res.ok || !res.data) { toast.error(t('fieldGov.error')); return; }
      const blob = new Blob([res.data.json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `field-governance-${entity}.json`; a.click();
      URL.revokeObjectURL(url);
    });
  }
  function doImport() {
    if (importText == null) return;
    run(() => importFieldGovernance(entity, importText), () => { setImportText(null); router.refresh(); });
  }

  // ── Reuse: copy / templates / history ───────────────────────────────────────
  function copyFrom(src: string) {
    if (!src || src === entity) return;
    if (!window.confirm(t('fieldGov.copyConfirm'))) return;
    run(() => copyEntityConfig(src, entity), () => router.refresh());
  }
  function saveTemplate() {
    if (!templateName.trim()) return;
    run(() => saveAsTemplate(entity, templateName.trim(), templateGlobal), () => { setTemplateName(''); setTemplateGlobal(false); router.refresh(); });
  }
  function useTemplate(id: string) {
    if (!id) return;
    run(() => applyTemplate(id, entity), () => router.refresh());
  }
  function loadHistory() {
    startTransition(async () => {
      const res = await getFieldGovernanceHistory(entity);
      if (res.ok && res.data) setHistory(res.data.rows);
      else toast.error(t('fieldGov.error'));
    });
  }

  // ── Draft / publish / rollback ──────────────────────────────────────────────
  function doPublish() {
    run(() => publishFieldGovernance(entity, publishLabel.trim() || undefined), () => { setPublishLabel(''); router.refresh(); });
  }
  function doRollback(versionId: string) {
    if (!window.confirm(t('fieldGov.rollbackConfirm'))) return;
    run(() => rollbackToVersion(entity, versionId), () => router.refresh());
  }
  const STATUS_LABEL: Record<string, string> = {
    draft: t('fieldGov.vStatusDraft'), published: t('fieldGov.vStatusPublished'), archived: t('fieldGov.vStatusArchived'),
  };

  return (
    <div className="space-y-6">
      {/* Entity selector + admin tools */}
      <div className="flex flex-wrap items-center gap-3">
        <Label className="text-sm">{t('fieldGov.entity')}</Label>
        <div className="w-52">
          <Select value={entity} disabled={pending} onChange={(e) => router.push(`/settings/field-governance?entity=${e.target.value}`)}>
            {entities.map((en) => <option key={en.key} value={en.key}>{ar ? en.labelAr : en.labelEn}</option>)}
          </Select>
        </div>
        <Button size="sm" variant="outline" disabled={pending} onClick={doExport}><Download className="h-4 w-4" /> {t('fieldGov.export')}</Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setImportText('')}><Upload className="h-4 w-4" /> {t('fieldGov.import')}</Button>
        <Button size="sm" variant="outline" className="text-destructive" disabled={pending} onClick={resetDefaults}><RotateCcw className="h-4 w-4" /> {t('fieldGov.reset')}</Button>
        {/* G6b: opt-in recommended baseline (customer only). Never auto-applied. */}
        {entity === 'customer' && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(t('fieldGov.baselineConfirm'))) return;
              run(() => applyCustomerGovernanceBaseline(), () => router.refresh());
            }}
          >
            <ShieldAlert className="h-4 w-4" /> {t('fieldGov.useBaseline')}
          </Button>
        )}
      </div>

      {importText != null && (
        <Card>
          <CardContent className="space-y-2 pt-4">
            <Label className="text-sm">{t('fieldGov.importTitle')}</Label>
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} dir="ltr" rows={6} className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs" placeholder='{"config":[],"access":[],"sections":[]}' />
            <div className="flex gap-2">
              <Button size="sm" disabled={pending || !importText.trim()} onClick={doImport}>{t('fieldGov.import')}</Button>
              <Button size="sm" variant="outline" onClick={() => setImportText(null)}>{t('fieldGov.cancel')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Reuse & history (copy / templates / change log) ──────── */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h3 className="font-semibold">{t('fieldGov.reuseTitle')}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('fieldGov.copyFrom')}</Label>
              <Select className={selectCls} value="" disabled={pending} onChange={(e) => copyFrom(e.target.value)}>
                <option value="">{t('fieldGov.copyFromPlaceholder')}</option>
                {entities.filter((en) => en.key !== entity).map((en) => <option key={en.key} value={en.key}>{ar ? en.labelAr : en.labelEn}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('fieldGov.applyTemplate')}</Label>
              <Select className={selectCls} value="" disabled={pending || admin.templates.length === 0} onChange={(e) => useTemplate(e.target.value)}>
                <option value="">{admin.templates.length ? t('fieldGov.applyTemplatePlaceholder') : t('fieldGov.noTemplates')}</option>
                {admin.templates.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}{tp.is_global ? ' ★' : ''}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('fieldGov.saveTemplate')}</Label>
              <div className="flex items-center gap-1.5">
                <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder={t('fieldGov.templateName')} className="h-9" />
                <Button size="sm" variant="outline" disabled={pending || !templateName.trim()} onClick={saveTemplate}>{t('fieldGov.save')}</Button>
              </div>
              {isPlatformOwner && (
                <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={templateGlobal} onChange={(e) => setTemplateGlobal(e.target.checked)} className="h-3.5 w-3.5" /> {t('fieldGov.templateGlobal')}</label>
              )}
            </div>
          </div>
          <Button size="sm" variant="ghost" disabled={pending} onClick={loadHistory}>{t('fieldGov.historyBtn')}</Button>
          {history && (
            <div className="max-h-60 overflow-y-auto rounded-md border text-xs">
              {history.length === 0 ? <p className="p-2 text-muted-foreground">{t('fieldGov.historyEmpty')}</p> : history.map((h, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 border-b p-2 last:border-0">
                  <span className="font-mono" dir="ltr">{h.field}</span>
                  <span className="text-muted-foreground">{h.action} · {h.actor ?? '—'} · <span dir="ltr">{new Date(h.at).toLocaleString()}</span></span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Draft / Publish / Versions ───────────────────────────── */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div>
            <h3 className="font-semibold">{t('fieldGov.publishTitle')}</h3>
            <p className="text-xs text-muted-foreground">{t('fieldGov.publishHint')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input value={publishLabel} onChange={(e) => setPublishLabel(e.target.value)} placeholder={t('fieldGov.publishLabel')} className="h-9 max-w-xs" />
            <Button size="sm" disabled={pending} onClick={doPublish}>{t('fieldGov.publishBtn')}</Button>
          </div>
          {admin.versions.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('fieldGov.versionsEmpty')}</p>
          ) : (
            <div className="divide-y rounded-md border text-sm">
              {admin.versions.map((v) => (
                <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
                  <span className="flex items-center gap-2">
                    <span className="font-mono">v{v.version_no}</span>
                    <Badge variant={v.status === 'published' ? 'success' : v.status === 'archived' ? 'secondary' : 'warning'}>{STATUS_LABEL[v.status] ?? v.status}</Badge>
                    {v.label && <span className="text-xs text-muted-foreground">{v.label}</span>}
                    <span className="text-xs text-muted-foreground" dir="ltr">{new Date(v.created_at).toLocaleString()}</span>
                  </span>
                  {v.status !== 'published' && (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => doRollback(v.id)}>{t('fieldGov.rollback')}</Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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

          {/* Search · filter by section · preview as role */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('fieldGov.searchPlaceholder')} className="ps-8" />
            </div>
            <div className="w-44">
              <Select className={selectCls} value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)}>
                <option value="">{t('fieldGov.allSections')}</option>
                <option value="__none__">{t('fieldGov.noSection')}</option>
                {sectionOpts.map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
            </div>
            <div className="flex items-center gap-1.5">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <div className="w-44">
                <Select className={selectCls} value={previewRole} onChange={(e) => setPreviewRole(e.target.value)}>
                  <option value="">{t('fieldGov.previewOff')}</option>
                  {admin.roles.map((r) => <option key={r.key} value={r.key}>{ar ? r.name_ar || r.key : r.key}</option>)}
                </Select>
              </div>
            </div>
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-secondary/30 p-2 text-sm">
              <span className="font-medium">{t('fieldGov.bulkSelected', { n: selected.size })}</span>
              <Select className={`${selectCls} w-40`} value="" onChange={(e) => { if (e.target.value) bulkApply({ default_access: e.target.value as ResolvedLevel }); }}>
                <option value="">{t('fieldGov.bulkSetAccess')}</option>
                <option value="hidden">{t('fieldGov.accessHidden')}</option>
                <option value="view">{t('fieldGov.accessView')}</option>
                <option value="request">{t('fieldGov.accessRequest')}</option>
                <option value="edit">{t('fieldGov.accessEdit')}</option>
                <option value="required">{t('fieldGov.accessRequired')}</option>
              </Select>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => bulkApply({ is_active: true })}>{t('fieldGov.bulkShow')}</Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => bulkApply({ is_active: false })}>{t('fieldGov.bulkHide')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t('fieldGov.bulkClear')}</Button>
            </div>
          )}

          <div className="divide-y rounded-md border">
            {visibleFields.map((f, i) => (
              <div key={f.key} className="space-y-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <input type="checkbox" checked={selected.has(f.key)} onChange={() => toggleSelect(f.key)} className="h-4 w-4" aria-label={fieldLabel(f)} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{fieldLabel(f)}</span>
                      <span className="font-mono text-[11px] text-muted-foreground" dir="ltr">{f.key}</span>
                    </span>
                  </span>
                  <div className="flex flex-wrap items-center gap-1">
                    {previewRole && <Badge variant="outline" className="gap-1"><Eye className="h-3 w-3" /> {ACCESS_LABEL[previewAccess(f)]}</Badge>}
                    <Badge variant="secondary">{f.source === 'custom' ? t('fieldGov.badgeCustom') : t('fieldGov.badgeCore')}</Badge>
                    {f.isProtected && <Badge variant="warning" className="gap-1"><ShieldAlert className="h-3 w-3" /> {t('fieldGov.badgeProtected')}</Badge>}
                    <Button size="sm" variant="ghost" disabled={pending || filtered || i === 0} onClick={() => moveField(f.key, -1)} aria-label={t('fieldGov.moveUp')}><ChevronUp className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" disabled={pending || filtered || i === visibleFields.length - 1} onClick={() => moveField(f.key, 1)} aria-label={t('fieldGov.moveDown')}><ChevronDown className="h-4 w-4" /></Button>
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
