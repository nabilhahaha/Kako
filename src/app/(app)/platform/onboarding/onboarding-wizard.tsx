'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  Check,
  CheckCircle2,
  AlertCircle,
  Building2,
  ShieldCheck,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n/provider';
import {
  INDUSTRY_PACK_IDS,
  getIndustryPack,
  type IndustryPack,
  type IndustryPackId,
} from '@/lib/erp/industry-packs';
import {
  PERMISSION_TEMPLATE_IDS,
  PERMISSION_TEMPLATES,
  composeOnboarding,
  type PermissionTemplateId,
} from '@/lib/erp/permission-templates';
import { resolveHierarchy, validateRoleSelection, isManagerRole } from '@/lib/erp/org-structure';
import type { BranchRole } from '@/lib/erp/types';
import { BRANCH_ROLES } from '@/lib/erp/constants';
import { MODULE_LABELS, type Module } from '@/lib/erp/navigation';
import {
  GRANULAR_CAPABILITY_LABELS,
  isDenyAllCapability,
} from '@/lib/erp/granular-capabilities';
import {
  createCompanyOnboarding,
  type CompanyStatus,
  type OnboardingResult,
} from './actions';

type Locale = 'ar' | 'en';
type Step = 'basics' | 'pack' | 'org' | 'template' | 'review' | 'success';

interface BasicsState {
  name: string;
  nameAr: string;
  country: string;
  currency: string;
  locale: Locale;
  timezone: string;
  status: CompanyStatus;
  adminEmail: string;
  adminName: string;
  adminPassword: string;
}

const STEP_ORDER: Exclude<Step, 'success'>[] = ['basics', 'pack', 'org', 'template', 'review'];

// Label helpers — never show raw keys / UUIDs to the user.
const roleLabel = (key: string, locale: Locale): string =>
  (BRANCH_ROLES as Record<string, { en: string; ar: string }>)[key]?.[locale] ?? key;
const moduleLabel = (key: string, locale: Locale): string =>
  (MODULE_LABELS as Record<string, { en: string; ar: string }>)[key]?.[locale] ?? key;
const capabilityLabel = (key: string, locale: Locale): string =>
  isDenyAllCapability(key) ? GRANULAR_CAPABILITY_LABELS[key][locale] : key;
const sectionLabel = (entity: string, section: string): string => `${entity} · ${section}`;

// scope dimension → authz dim* i18n label key (reused by Org + Review steps).
const SCOPE_DIM_KEY: Record<string, string> = {
  company: 'authz.dimCompany',
  branch: 'authz.dimBranch',
  region: 'authz.dimRegion',
  area: 'authz.dimArea',
  own_customers: 'authz.dimOwnCustomers',
  own_team: 'authz.dimOwnTeam',
};

export function OnboardingWizard() {
  const { t, locale, dir } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState<Step>('basics');
  const [basics, setBasics] = useState<BasicsState>({
    name: '',
    nameAr: '',
    country: '',
    currency: 'SAR',
    locale: 'ar',
    timezone: 'Asia/Riyadh',
    status: 'trial',
    adminEmail: '',
    adminName: '',
    adminPassword: '',
  });
  const [packId, setPackId] = useState<IndustryPackId | null>(null);
  // Optional roles (org structure). Defaults to all of the selected pack's roles.
  const [selectedRoles, setSelectedRoles] = useState<BranchRole[]>([]);
  const [templateId, setTemplateId] = useState<PermissionTemplateId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OnboardingResult | null>(null);

  const pack = packId ? getIndustryPack(packId) : null;

  // Live preview (client-safe, pure). Recomputes whenever pack, template OR the
  // chosen role set changes — this is what makes the decoupling visible in the UI.
  const composed = useMemo(
    () => (pack && templateId ? composeOnboarding(pack, templateId, selectedRoles) : null),
    [pack, templateId, selectedRoles],
  );

  // Pick an industry pack → seed the role selection to all of its roles (org step).
  function selectPack(id: IndustryPackId) {
    setPackId(id);
    setSelectedRoles([...(getIndustryPack(id)?.roles ?? [])]);
  }

  function toggleRole(role: BranchRole) {
    if (role === 'admin') return; // mandatory — mirror validateRoleSelection
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  const rolesValid = validateRoleSelection(selectedRoles).ok;
  const basicsValid = basics.name.trim().length > 0 && basics.adminEmail.trim().length > 0;
  const canNext =
    (step === 'basics' && basicsValid) ||
    (step === 'pack' && !!packId) ||
    (step === 'org' && rolesValid) ||
    (step === 'template' && !!templateId);

  function set<K extends keyof BasicsState>(key: K, value: BasicsState[K]) {
    setBasics((prev) => ({ ...prev, [key]: value }));
  }

  function goNext() {
    const idx = STEP_ORDER.indexOf(step as Exclude<Step, 'success'>);
    if (idx >= 0 && idx < STEP_ORDER.length - 1) setStep(STEP_ORDER[idx + 1]);
  }
  function goBack() {
    setError(null);
    const idx = STEP_ORDER.indexOf(step as Exclude<Step, 'success'>);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
  }

  function onCreate() {
    if (!packId || !templateId) return;
    setError(null);
    startTransition(async () => {
      const res = await createCompanyOnboarding({
        basics: {
          name: basics.name.trim(),
          nameAr: basics.nameAr.trim() || undefined,
          country: basics.country.trim() || undefined,
          currency: basics.currency.trim() || 'SAR',
          locale: basics.locale,
          timezone: basics.timezone.trim() || undefined,
          status: basics.status,
          adminEmail: basics.adminEmail.trim(),
          adminName: basics.adminName.trim() || undefined,
          adminPassword: basics.adminPassword || undefined,
        },
        industryPackId: packId,
        permissionTemplateId: templateId,
        selectedRoles,
      });
      if (!res.ok || !res.data) {
        setError(res.error ?? t('onboarding.errorTitle'));
        return;
      }
      setResult(res.data);
      setStep('success');
    });
  }

  function reset() {
    setBasics({
      name: '',
      nameAr: '',
      country: '',
      currency: 'SAR',
      locale: 'ar',
      timezone: 'Asia/Riyadh',
      status: 'trial',
      adminEmail: '',
      adminName: '',
      adminPassword: '',
    });
    setPackId(null);
    setSelectedRoles([]);
    setTemplateId(null);
    setError(null);
    setResult(null);
    setStep('basics');
    router.refresh();
  }

  if (step === 'success' && result) {
    return <SuccessScreen result={result} locale={locale} t={t} onReset={reset} />;
  }

  const stepIndex = STEP_ORDER.indexOf(step as Exclude<Step, 'success'>);

  return (
    <div className="space-y-6" dir={dir}>
      <Stepper current={stepIndex} t={t} />

      {step === 'basics' && <BasicsStep basics={basics} set={set} t={t} />}
      {step === 'pack' && (
        <PackStep packId={packId} onSelect={selectPack} locale={locale} t={t} />
      )}
      {step === 'org' && pack && (
        <OrgStep
          pack={pack}
          selectedRoles={selectedRoles}
          onToggle={toggleRole}
          composed={composed}
          locale={locale}
          t={t}
        />
      )}
      {step === 'template' && (
        <TemplateStep
          templateId={templateId}
          onSelect={setTemplateId}
          composed={composed}
          packId={packId}
          locale={locale}
          t={t}
        />
      )}
      {step === 'review' && pack && composed && (
        <ReviewStep
          basics={basics}
          packId={packId!}
          templateId={templateId!}
          composed={composed}
          selectedRoles={selectedRoles}
          locale={locale}
          t={t}
        />
      )}

      {error && (
        <Card className="border-s-2 border-s-destructive">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">{t('onboarding.errorTitle')}</p>
              <p className="text-muted-foreground">{error}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('onboarding.errorRetry')}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer nav — one obvious primary action; Back is secondary. */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {stepIndex > 0 ? (
          <Button variant="secondary" onClick={goBack} disabled={pending}>
            {dir === 'rtl' ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
            {t('onboarding.back')}
          </Button>
        ) : (
          <span />
        )}

        {step === 'review' ? (
          <Button onClick={onCreate} disabled={pending} className="sm:min-w-56">
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('onboarding.creating')}
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                {t('onboarding.create')}
              </>
            )}
          </Button>
        ) : (
          <Button onClick={goNext} disabled={!canNext}>
            {t('onboarding.next')}
            {dir === 'rtl' ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Stepper ──────────────────────────────────────────────────────────────────
function Stepper({ current, t }: { current: number; t: (k: string, p?: Record<string, string | number>) => string }) {
  const steps = [
    { key: 'basics', label: t('onboarding.stepBasics') },
    { key: 'pack', label: t('onboarding.stepPack') },
    { key: 'org', label: t('onboarding.stepOrg') },
    { key: 'template', label: t('onboarding.stepTemplate') },
    { key: 'review', label: t('onboarding.stepReview') },
  ];
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground sm:hidden">
        {t('onboarding.stepOf', { current: current + 1, total: steps.length })}
      </p>
      <ol className="flex flex-wrap gap-2 overflow-x-auto">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.key} className="flex min-w-fit items-center gap-2">
              <span
                className={[
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : done
                      ? 'bg-success/15 text-success'
                      : 'bg-secondary text-muted-foreground',
                ].join(' ')}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span
                className={`whitespace-nowrap text-sm ${active ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
              >
                {s.label}
              </span>
              {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-border" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── Step 1: Basics ───────────────────────────────────────────────────────────
function BasicsStep({
  basics,
  set,
  t,
}: {
  basics: BasicsState;
  set: <K extends keyof BasicsState>(key: K, value: BasicsState[K]) => void;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <div>
          <h2 className="text-lg font-semibold">{t('onboarding.basicsTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('onboarding.basicsHint')}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">{t('onboarding.name')}</Label>
            <Input
              id="name"
              value={basics.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder={t('onboarding.namePlaceholder')}
              required
            />
            {basics.name.trim().length === 0 && (
              <p className="text-xs text-muted-foreground">{t('onboarding.nameRequired')}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="nameAr">{t('onboarding.nameAr')}</Label>
            <Input
              id="nameAr"
              value={basics.nameAr}
              onChange={(e) => set('nameAr', e.target.value)}
              placeholder={t('onboarding.nameArPlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="country">{t('onboarding.country')}</Label>
            <Input
              id="country"
              value={basics.country}
              onChange={(e) => set('country', e.target.value)}
              placeholder={t('onboarding.countryPlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">{t('onboarding.currency')}</Label>
            <Input
              id="currency"
              dir="ltr"
              value={basics.currency}
              onChange={(e) => set('currency', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="locale">{t('onboarding.language')}</Label>
            <Select
              id="locale"
              value={basics.locale}
              onChange={(e) => set('locale', e.target.value as Locale)}
            >
              <option value="ar">{t('onboarding.langAr')}</option>
              <option value="en">{t('onboarding.langEn')}</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">{t('onboarding.timezone')}</Label>
            <Input
              id="timezone"
              dir="ltr"
              value={basics.timezone}
              onChange={(e) => set('timezone', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">{t('onboarding.status')}</Label>
            <Select
              id="status"
              value={basics.status}
              onChange={(e) => set('status', e.target.value as CompanyStatus)}
            >
              <option value="trial">{t('onboarding.statusTrial')}</option>
              <option value="active">{t('onboarding.statusActive')}</option>
              <option value="suspended">{t('onboarding.statusSuspended')}</option>
            </Select>
          </div>
        </div>

        <div className="space-y-4 rounded-md border bg-secondary/20 p-4">
          <Label>{t('onboarding.adminSection')}</Label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="adminEmail">{t('onboarding.adminEmail')}</Label>
              <Input
                id="adminEmail"
                type="email"
                dir="ltr"
                value={basics.adminEmail}
                onChange={(e) => set('adminEmail', e.target.value)}
                placeholder={t('onboarding.adminEmailPlaceholder')}
                required
              />
              {basics.adminEmail.trim().length === 0 && (
                <p className="text-xs text-muted-foreground">{t('onboarding.adminEmailRequired')}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminName">{t('onboarding.adminName')}</Label>
              <Input
                id="adminName"
                value={basics.adminName}
                onChange={(e) => set('adminName', e.target.value)}
                placeholder={t('onboarding.adminNamePlaceholder')}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="adminPassword">{t('onboarding.adminPassword')}</Label>
              <Input
                id="adminPassword"
                type="password"
                dir="ltr"
                value={basics.adminPassword}
                onChange={(e) => set('adminPassword', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('onboarding.adminPasswordHint')}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Step 2: Industry pack ────────────────────────────────────────────────────
function PackStep({
  packId,
  onSelect,
  locale,
  t,
}: {
  packId: IndustryPackId | null;
  onSelect: (id: IndustryPackId) => void;
  locale: Locale;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t('onboarding.packTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('onboarding.packHint')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {INDUSTRY_PACK_IDS.map((id) => {
          const p = getIndustryPack(id)!;
          const selected = packId === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-pressed={selected}
              className={[
                'rounded-lg border p-4 text-start transition-colors',
                selected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-input hover:border-primary/40 hover:bg-secondary/40',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{locale === 'ar' ? p.labelAr : p.labelEn}</span>
                {selected && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {locale === 'ar' ? p.descriptionAr : p.descriptionEn}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                {t('onboarding.packModulesRoles', { modules: p.modules.length, roles: p.roles.length })}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 3: Organization structure (optional roles + reporting hierarchy) ────
function OrgStep({
  pack,
  selectedRoles,
  onToggle,
  composed,
  locale,
  t,
}: {
  pack: IndustryPack;
  selectedRoles: BranchRole[];
  onToggle: (role: BranchRole) => void;
  composed: ReturnType<typeof composeOnboarding> | null;
  locale: Locale;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  const selected = new Set(selectedRoles);
  // Live reporting hierarchy derived from the current selection.
  const edges = resolveHierarchy(selectedRoles);
  const parentOf = new Map<string, BranchRole | null>(
    edges.map((e) => [e.roleKey, e.reportsToRoleKey] as const),
  );
  const recommended = composed?.recommendedScopes ?? {};

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t('onboarding.orgTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('onboarding.orgHint')}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Role selection */}
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div>
              <h3 className="font-medium">{t('onboarding.orgRolesTitle')}</h3>
              <p className="text-xs text-muted-foreground">{t('onboarding.orgRolesHint')}</p>
            </div>
            <ul className="space-y-1.5">
              {pack.roles.map((role) => {
                const isAdmin = role === 'admin';
                const checked = isAdmin || selected.has(role);
                return (
                  <li key={role}>
                    <label
                      className={[
                        'flex cursor-pointer items-center gap-3 rounded-md border p-2.5 transition-colors',
                        checked ? 'border-primary/40 bg-primary/5' : 'border-input hover:bg-secondary/40',
                        isAdmin ? 'cursor-not-allowed opacity-90' : '',
                      ].join(' ')}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--primary,#0891b2)]"
                        checked={checked}
                        disabled={isAdmin}
                        onChange={() => onToggle(role)}
                      />
                      <span className="flex-1 text-sm font-medium">{roleLabel(role, locale)}</span>
                      {isAdmin && <Badge variant="secondary">{t('onboarding.orgRoleMandatory')}</Badge>}
                    </label>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        {/* Reporting hierarchy preview */}
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div>
              <h3 className="font-medium">{t('onboarding.orgHierarchyTitle')}</h3>
              <p className="text-xs text-muted-foreground">{t('onboarding.orgHierarchyHint')}</p>
            </div>
            <ul className="space-y-1.5 text-sm">
              {selectedRoles.map((role) => {
                const parent = parentOf.get(role) ?? null;
                const depth = role === 'admin' ? 0 : isManagerRole(role, edges) ? 1 : 2;
                const scope = recommended[role];
                return (
                  <li
                    key={role}
                    className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5"
                    style={{ marginInlineStart: `${depth * 16}px` }}
                  >
                    <span className="font-medium text-foreground">{roleLabel(role, locale)}</span>
                    <span className="text-muted-foreground">{t('onboarding.orgReportsTo')}</span>
                    <span className="text-muted-foreground">
                      {parent ? roleLabel(parent, locale) : t('onboarding.orgTopLevel')}
                    </span>
                    {scope && (
                      <Badge variant="outline" className="ms-1">
                        {t('onboarding.orgRecommendedScope')}: {t(SCOPE_DIM_KEY[scope] ?? 'authz.dimCompany')}
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
            {!validateRoleSelection(selectedRoles).ok && (
              <p className="text-xs text-destructive">{t('onboarding.orgAdminRequired')}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Step 4: Permission template + live preview ───────────────────────────────
function TemplateStep({
  templateId,
  onSelect,
  composed,
  packId,
  locale,
  t,
}: {
  templateId: PermissionTemplateId | null;
  onSelect: (id: PermissionTemplateId) => void;
  composed: ReturnType<typeof composeOnboarding> | null;
  packId: IndustryPackId | null;
  locale: Locale;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  const pack = packId ? getIndustryPack(packId) : null;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t('onboarding.templateTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('onboarding.templateHint')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {PERMISSION_TEMPLATE_IDS.map((id) => {
          const tpl = PERMISSION_TEMPLATES[id];
          const selected = templateId === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-pressed={selected}
              className={[
                'rounded-lg border p-4 text-start transition-colors',
                selected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-input hover:border-primary/40 hover:bg-secondary/40',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{locale === 'ar' ? tpl.labelAr : tpl.labelEn}</span>
                {selected && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {locale === 'ar' ? tpl.descriptionAr : tpl.descriptionEn}
              </p>
            </button>
          );
        })}
      </div>

      {/* LIVE preview — proves the preview differs per template for a fixed pack. */}
      {composed && pack && templateId && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h3 className="font-medium">{t('onboarding.previewTitle')}</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('onboarding.previewFor', {
                pack: locale === 'ar' ? pack.labelAr : pack.labelEn,
                template:
                  locale === 'ar'
                    ? PERMISSION_TEMPLATES[templateId].labelAr
                    : PERMISSION_TEMPLATES[templateId].labelEn,
              })}
            </p>
            <PreviewBody composed={composed} locale={locale} t={t} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PreviewBody({
  composed,
  locale,
  t,
}: {
  composed: ReturnType<typeof composeOnboarding>;
  locale: Locale;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  const { payload } = composed;
  // Capabilities → flat (role → cap) list using label maps.
  const capRows = Object.entries(payload.capabilities).flatMap(([role, caps]) =>
    caps.map((c) => ({ role, cap: c })),
  );
  // Section access → group hidden roles per (entity/section).
  const hiddenBySection = new Map<string, string[]>();
  for (const r of payload.section_access) {
    if (r.access !== 'hidden') continue;
    const k = sectionLabel(r.entity, r.section_key);
    const arr = hiddenBySection.get(k) ?? [];
    arr.push(roleLabel(r.subject_key, locale));
    hiddenBySection.set(k, arr);
  }
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <PreviewColumn title={t('onboarding.previewCapabilities')}>
        {capRows.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('onboarding.previewNoCapabilities')}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {capRows.map(({ role, cap }, i) => (
              <li key={`${role}-${cap}-${i}`} className="text-muted-foreground">
                <span className="text-foreground">{roleLabel(role, locale)}</span>
                {' — '}
                {capabilityLabel(cap, locale)}
              </li>
            ))}
          </ul>
        )}
      </PreviewColumn>

      <PreviewColumn title={t('onboarding.previewLimits')}>
        {payload.limits.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('onboarding.previewNoLimits')}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {payload.limits.map((l, i) => (
              <li key={`${l.role_key}-${l.action}-${i}`} className="text-muted-foreground">
                <span className="text-foreground">{roleLabel(l.role_key, locale)}</span>
                {' — '}
                {capabilityLabel(l.action, locale)}
                {': '}
                <span dir="ltr">
                  {l.max_amount != null ? l.max_amount.toLocaleString() : null}
                  {l.max_percent != null ? `${l.max_percent}%` : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PreviewColumn>

      <PreviewColumn title={t('onboarding.previewHidden')}>
        {hiddenBySection.size === 0 ? (
          <p className="text-xs text-muted-foreground">{t('onboarding.previewNoHidden')}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {[...hiddenBySection.entries()].map(([section, roles]) => (
              <li key={section} className="text-muted-foreground">
                <span className="text-foreground">{section}</span>
                {' — '}
                {t('onboarding.reviewSectionsHidden', { roles: roles.join('، ') })}
              </li>
            ))}
          </ul>
        )}
      </PreviewColumn>
    </div>
  );
}

function PreviewColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-secondary/10 p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

// ── Step 4: Review ───────────────────────────────────────────────────────────
function ReviewStep({
  basics,
  packId,
  templateId,
  composed,
  selectedRoles,
  locale,
  t,
}: {
  basics: BasicsState;
  packId: IndustryPackId;
  templateId: PermissionTemplateId;
  composed: ReturnType<typeof composeOnboarding>;
  selectedRoles: BranchRole[];
  locale: Locale;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  const pack = getIndustryPack(packId)!;
  const tpl = PERMISSION_TEMPLATES[templateId];
  const adminCreated = basics.adminPassword.length >= 6;

  // scope dimension → authz dim* label key (shared constant)
  const dimKey = SCOPE_DIM_KEY;

  // The chosen role subset (org structure) — always includes admin via composed.
  const generatedRoles = composed.payload.roles;
  void selectedRoles; // chosen subset is reflected via composed (single source of truth)

  const hiddenBySection = new Map<string, string[]>();
  for (const r of composed.payload.section_access) {
    if (r.access !== 'hidden') continue;
    const k = sectionLabel(r.entity, r.section_key);
    const arr = hiddenBySection.get(k) ?? [];
    arr.push(roleLabel(r.subject_key, locale));
    hiddenBySection.set(k, arr);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t('onboarding.reviewTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('onboarding.reviewHint')}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReviewCard title={t('onboarding.reviewCompany')}>
          <Row label={t('onboarding.name')} value={basics.name} />
          {basics.nameAr && <Row label={t('onboarding.nameAr')} value={basics.nameAr} />}
          {basics.country && <Row label={t('onboarding.country')} value={basics.country} />}
          <Row label={t('onboarding.currency')} value={basics.currency} ltr />
          <Row label={t('onboarding.language')} value={basics.locale === 'ar' ? t('onboarding.langAr') : t('onboarding.langEn')} />
          <Row label={t('onboarding.timezone')} value={basics.timezone} ltr />
          <Row
            label={t('onboarding.status')}
            value={t(`onboarding.status${basics.status.charAt(0).toUpperCase()}${basics.status.slice(1)}`)}
          />
        </ReviewCard>

        <ReviewCard title={t('onboarding.reviewAdmin')}>
          <Row label={t('onboarding.adminEmail')} value={basics.adminEmail} ltr />
          {basics.adminName && <Row label={t('onboarding.adminName')} value={basics.adminName} />}
          <p className="text-sm text-muted-foreground">
            {adminCreated ? t('onboarding.reviewAdminCreated') : t('onboarding.reviewAdminInvited')}
          </p>
        </ReviewCard>

        <ReviewCard title={t('onboarding.reviewPack')}>
          <p className="font-medium">{locale === 'ar' ? pack.labelAr : pack.labelEn}</p>
          <p className="text-sm text-muted-foreground">
            {locale === 'ar' ? pack.descriptionAr : pack.descriptionEn}
          </p>
        </ReviewCard>

        <ReviewCard title={t('onboarding.reviewTemplate')}>
          <p className="font-medium">{locale === 'ar' ? tpl.labelAr : tpl.labelEn}</p>
          <p className="text-sm text-muted-foreground">
            {locale === 'ar' ? tpl.descriptionAr : tpl.descriptionEn}
          </p>
        </ReviewCard>

        <ReviewCard title={t('onboarding.reviewModules')}>
          <div className="flex flex-wrap gap-1.5">
            {pack.modules.map((m) => (
              <Badge key={m} variant="secondary">
                {moduleLabel(m as Module, locale)}
              </Badge>
            ))}
          </div>
        </ReviewCard>

        <ReviewCard title={t('onboarding.reviewRoles')}>
          <div className="flex flex-wrap gap-1.5">
            {generatedRoles.map((r) => (
              <Badge key={r} variant="secondary">
                {roleLabel(r, locale)}
              </Badge>
            ))}
          </div>
        </ReviewCard>

        <ReviewCard title={t('onboarding.reviewHierarchy')}>
          {composed.hierarchy.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('onboarding.reviewNoHierarchy')}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {composed.hierarchy.map((e) => (
                <li key={e.roleKey} className="text-muted-foreground">
                  <span className="text-foreground">{roleLabel(e.roleKey, locale)}</span>
                  {' '}
                  {t('onboarding.orgReportsTo')}
                  {' '}
                  {e.reportsToRoleKey
                    ? roleLabel(e.reportsToRoleKey, locale)
                    : t('onboarding.orgTopLevel')}
                </li>
              ))}
            </ul>
          )}
        </ReviewCard>

        <ReviewCard title={t('onboarding.reviewLimits')}>
          {composed.payload.limits.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('onboarding.reviewNoLimits')}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {composed.payload.limits.map((l, i) => (
                <li key={`${l.role_key}-${l.action}-${i}`} className="text-muted-foreground">
                  <span className="text-foreground">{roleLabel(l.role_key, locale)}</span>
                  {' — '}
                  {capabilityLabel(l.action, locale)}
                  {': '}
                  <span dir="ltr">
                    {l.max_amount != null ? l.max_amount.toLocaleString() : null}
                    {l.max_percent != null ? `${l.max_percent}%` : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ReviewCard>

        <ReviewCard title={t('onboarding.reviewSections')}>
          {hiddenBySection.size === 0 ? (
            <p className="text-sm text-muted-foreground">{t('onboarding.reviewNoSections')}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {[...hiddenBySection.entries()].map(([section, roles]) => (
                <li key={section} className="text-muted-foreground">
                  <span className="text-foreground">{section}</span>
                  {' — '}
                  {t('onboarding.reviewSectionsHidden', { roles: roles.join('، ') })}
                </li>
              ))}
            </ul>
          )}
        </ReviewCard>

        <ReviewCard title={t('onboarding.reviewScopes')}>
          {Object.keys(composed.recommendedScopes).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('onboarding.reviewNoScopes')}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {Object.entries(composed.recommendedScopes).map(([role, dim]) => (
                <li key={role} className="text-muted-foreground">
                  <span className="text-foreground">{roleLabel(role, locale)}</span>
                  {' — '}
                  {t(dimKey[dim] ?? 'authz.dimCompany')}
                </li>
              ))}
            </ul>
          )}
        </ReviewCard>
      </div>
    </div>
  );
}

function ReviewCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
        {children}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium" dir={ltr ? 'ltr' : undefined}>
        {value}
      </span>
    </div>
  );
}

// ── Step 6: Success ──────────────────────────────────────────────────────────
function SuccessScreen({
  result,
  locale,
  t,
  onReset,
}: {
  result: OnboardingResult;
  locale: Locale;
  t: (k: string, p?: Record<string, string | number>) => string;
  onReset: () => void;
}) {
  void locale;
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Card>
        <CardContent className="space-y-5 pt-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
          <div>
            <h2 className="text-xl font-bold">{t('onboarding.successTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('onboarding.successSubtitle')}</p>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Badge variant={result.adminStatus === 'created' ? 'success' : 'info'}>
              {result.adminStatus === 'created'
                ? t('onboarding.successAdminCreated')
                : t('onboarding.successAdminInvited')}
            </Badge>
            <Badge variant="secondary">{t('onboarding.successModules', { count: result.summary.modules })}</Badge>
            <Badge variant="secondary">{t('onboarding.successRoles', { count: result.summary.roles })}</Badge>
            <Badge variant="secondary">
              {t('onboarding.successCapabilities', { count: result.summary.capabilities })}
            </Badge>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Link href={`/platform/companies/${result.companyId}`}>
              <Button className="w-full">
                <Building2 className="h-4 w-4" />
                {t('onboarding.openCompany')}
              </Button>
            </Link>
            <Link href="/settings/authz">
              <Button variant="secondary" className="w-full">
                <ShieldCheck className="h-4 w-4" />
                {t('onboarding.openAuthz')}
                <ExternalLink className="h-4 w-4" />
              </Button>
            </Link>
            <Button variant="outline" className="w-full" onClick={onReset}>
              <RotateCcw className="h-4 w-4" />
              {t('onboarding.createAnother')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
