'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Route as RouteIcon, LogOut, Plus, Clock, CheckCircle2, XCircle, Ban, Loader2, RotateCcw, ExternalLink, UserPlus, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { resolveSubscription, renewWhatsAppNumber, ROUTE_PLANNER_WHATSAPP_KEY, type RoutePlannerStatus } from '@/lib/erp/route-planner-subscription';
import {
  type PlannerTenantRow,
  type AdminDiagnostics,
  createRoutePlannerTenant,
  extendTrial,
  activateSubscription,
  setTenantSuspended,
  resetDemoData,
  addRoutePlannerUser,
  routePlannerAdminDiagnostics,
} from './planner-admin-actions';

const STATUS_SKIN: Record<RoutePlannerStatus, string> = {
  trial: 'bg-emerald-100 text-emerald-700',
  active: 'bg-sky-100 text-sky-700',
  expired: 'bg-red-100 text-red-700',
  suspended: 'bg-zinc-200 text-zinc-700',
};

export function PlannerAdminConsole({ initialTenants, loadError }: { initialTenants: PlannerTenantRow[]; loadError: string | null }) {
  const { t, locale, setLocale } = useI18n();
  const [tenants, setTenants] = useState(initialTenants);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RoutePlannerStatus | 'all'>('all');
  const [whatsApp, setWhatsApp] = useState('');
  const [pending, startTransition] = useTransition();

  const [diag, setDiag] = useState<AdminDiagnostics | null>(null);
  // Add-user modal state (per company).
  const [addUserFor, setAddUserFor] = useState<{ id: string; name: string } | null>(null);
  const [uName, setUName] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uPassword, setUPassword] = useState('');
  const [uRole, setURole] = useState<'admin' | 'user'>('user');
  // After a successful create we keep the modal open showing the exact credentials, so the
  // admin hands over the precise email/password (the #1 cause of "can't log in" is a typo).
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);

  function openAddUser(c: PlannerTenantRow) {
    setAddUserFor({ id: c.id, name: c.name });
    setUName(''); setUEmail(''); setUPassword(''); setURole('user'); setActionError(null); setCreatedCreds(null);
  }
  function submitAddUser() {
    if (!addUserFor) return;
    startTransition(async () => {
      const res = await addRoutePlannerUser(addUserFor.id, { name: uName, email: uEmail, password: uPassword, role: uRole });
      if (!res.ok) { setActionError(res.error ?? null); toast.error(t('routePlanner.adminError'), { description: res.error }); return; }
      setActionError(null);
      setCreatedCreds({ email: uEmail.trim().toLowerCase(), password: uPassword });
      toast.success(t('routePlanner.adminUserCreated'));
    });
  }

  // Load the current (possibly overridden) support WhatsApp number + runtime diagnostics.
  useEffect(() => { setWhatsApp(renewWhatsAppNumber()); }, []);
  useEffect(() => { routePlannerAdminDiagnostics().then((r) => { if (r.ok && r.data) setDiag(r.data); }); }, []);

  function saveWhatsApp() {
    const digits = whatsApp.replace(/[^\d]/g, '');
    try { window.localStorage.setItem(ROUTE_PLANNER_WHATSAPP_KEY, digits); } catch { /* ignore */ }
    setWhatsApp(digits);
    toast.success(t('routePlanner.adminWhatsAppSaved'));
  }

  // Derive each tenant's live subscription status (same resolver the planner uses).
  const allRows = useMemo(
    () => tenants.map((c) => ({
      c,
      view: resolveSubscription({
        companyName: c.name, tenantId: c.id, isActive: c.isActive, planKey: c.planKey,
        trialEndsAt: c.trialEndsAt, subscriptionStart: c.subscriptionStart, subscriptionEnd: c.subscriptionEnd, createdAt: c.createdAt,
      }),
    })),
    [tenants],
  );

  const counts = useMemo(() => {
    const acc = { trial: 0, active: 0, expired: 0, suspended: 0 } as Record<RoutePlannerStatus, number>;
    for (const r of allRows) acc[r.view.status] += 1;
    return acc;
  }, [allRows]);

  // Search by company name + filter by status.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter(({ c, view }) =>
      (statusFilter === 'all' || view.status === statusFilter) &&
      (q === '' || c.name.toLowerCase().includes(q)),
    );
  }, [allRows, search, statusFilter]);

  // The last server-action error (raw, for diagnosis) shown inline + in the toast.
  const [actionError, setActionError] = useState<string | null>(null);

  // Optimistic refresh: re-run a server action then patch a single row from its result is
  // overkill — instead we apply the known field change locally so the table reflects it.
  function run(action: () => Promise<{ ok: boolean; error?: string }>, patch: (c: PlannerTenantRow) => PlannerTenantRow, id: string) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) { setActionError(res.error ?? null); toast.error(t('routePlanner.adminError'), { description: res.error }); return; }
      setActionError(null);
      setTenants((prev) => prev.map((c) => (c.id === id ? patch(c) : c)));
      toast.success(t('routePlanner.adminUpdated'));
    });
  }

  const isoIn = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

  function onCreate() {
    const clean = name.trim();
    if (!clean) return;
    startTransition(async () => {
      const res = await createRoutePlannerTenant(clean);
      if (!res.ok || !res.data) { setActionError(res.ok ? null : res.error); toast.error(t('routePlanner.adminError'), { description: res.ok ? undefined : res.error }); return; }
      setActionError(null);
      setTenants((prev) => [
        { id: res.data!.id, name: clean, planKey: 'route_planner_trial', isActive: true, trialEndsAt: isoIn(30), subscriptionStart: null, subscriptionEnd: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), customerCount: 0, routeCount: 0, lastActivity: null },
        ...prev,
      ]);
      setName('');
      toast.success(t('routePlanner.adminCreated'));
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 lg:p-6">
      {/* Branded chrome-free header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"><RouteIcon className="h-4 w-4" /></div>
          <div>
            <p className="text-sm font-bold leading-tight tracking-tight">VANTORA <span className="font-medium text-muted-foreground">Route Planner</span></p>
            <p className="text-[11px] leading-tight text-muted-foreground">{t('routePlanner.adminTitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="inline-flex overflow-hidden rounded-md border text-[11px]">
            <button onClick={() => setLocale('en')} className={`px-2 py-0.5 ${locale === 'en' ? 'bg-primary font-semibold text-primary-foreground' : 'bg-background hover:bg-muted'}`}>EN</button>
            <button onClick={() => setLocale('ar')} className={`border-s px-2 py-0.5 ${locale === 'ar' ? 'bg-primary font-semibold text-primary-foreground' : 'bg-background hover:bg-muted'}`}>العربية</button>
          </div>
          <form action="/auth/signout" method="post">
            <button type="submit" className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium hover:bg-muted"><LogOut className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('common.signOut')}</span></button>
          </form>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{t('routePlanner.adminSubtitle')}</p>

      {/* Usage overview */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          ['trial', t('routePlanner.adminStatusTrial'), counts.trial],
          ['active', t('routePlanner.adminStatusActive'), counts.active],
          ['expired', t('routePlanner.adminStatusExpired'), counts.expired],
          ['suspended', t('routePlanner.adminStatusSuspended'), counts.suspended],
        ] as [RoutePlannerStatus, string, number][]).map(([k, label, n]) => (
          <button key={k} onClick={() => setStatusFilter((prev) => (prev === k ? 'all' : k))} className={`rounded-xl border bg-card text-start transition hover:border-primary/40 ${statusFilter === k ? 'border-primary ring-1 ring-primary/30' : ''}`}>
            <div className="p-3">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold tabular-nums">{n}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Create tenant */}
      <Card><CardContent className="flex flex-wrap items-end gap-2 p-3">
        <div className="flex-1">
          <label className="block text-[11px] text-muted-foreground">{t('routePlanner.adminTenantName')}</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('routePlanner.adminTenantNamePlaceholder')} className="h-9" />
        </div>
        <Button size="sm" onClick={onCreate} disabled={pending || !name.trim()}><Plus className="h-4 w-4" /> {t('routePlanner.adminCreate')}</Button>
      </CardContent></Card>

      {/* Configurable WhatsApp contact (used by renewal / support buttons product-wide). */}
      <Card><CardContent className="flex flex-wrap items-end gap-2 p-3">
        <div className="flex-1">
          <label className="block text-[11px] text-muted-foreground">{t('routePlanner.adminWhatsApp')}</label>
          <Input value={whatsApp} onChange={(e) => setWhatsApp(e.target.value)} placeholder="966567628842" dir="ltr" className="h-9 max-w-xs" />
          <p className="mt-1 text-[11px] text-muted-foreground">{t('routePlanner.adminWhatsAppHint')}</p>
        </div>
        <Button size="sm" variant="outline" onClick={saveWhatsApp}>{t('routePlanner.adminSave')}</Button>
      </CardContent></Card>

      {loadError && <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{t('routePlanner.adminLoadError')} <span className="font-mono text-xs opacity-80">{loadError}</span></p>}
      {actionError && <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"><span className="font-semibold">{t('routePlanner.adminError')}</span> <span className="font-mono text-xs opacity-80">{actionError}</span></p>}

      {/* Safe runtime diagnostics (no secret) — confirms the service-role key + Supabase target. */}
      {diag && (
        <div className={`rounded-md border px-3 py-2 text-xs ${diag.serviceKeyLooksValid && diag.keyMatchesUrl !== false ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-400 bg-amber-50 text-amber-900'}`}>
          <p className="mb-1 font-semibold">{t('routePlanner.adminDiag')}</p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 font-mono sm:grid-cols-2">
            <span>deployment = <b>{diag.vercelEnv ?? '—'}</b>{diag.commitSha ? ` · ${diag.commitSha}` : ''}{diag.gitRef ? ` · ${diag.gitRef}` : ''}</span>
            <span>account = <b>{diag.email ?? '—'}</b></span>
            <span>isRoutePlannerAdmin = <b>{String(diag.isRoutePlannerAdmin)}</b> · experience = <b>{String(diag.isRoutePlannerExperience)}</b></span>
            <span>memberships = <b>{diag.memberships}</b> · companyId = <b>{diag.companyId ? 'set' : 'null'}</b></span>
            <span>SERVICE_ROLE_KEY = <b>{diag.serviceKeyPresent ? `present (len ${diag.serviceKeyLength}, ${diag.serviceKeyShape})` : 'MISSING'}</b> {diag.serviceKeyLooksValid ? '✓ valid shape' : '⚠ INVALID — expect ~200+ char JWT or sb_secret_'}</span>
            <span>NEXT_PUBLIC_SUPABASE_URL = <b>{diag.supabaseRef ?? diag.supabaseUrl}</b></span>
            <span>key project ref = <b>{diag.serviceKeyRef ?? '—'}</b>{diag.keyMatchesUrl === false ? ' ⚠ mismatch' : diag.keyMatchesUrl === true ? ' ✓ match' : ''}</span>
          </div>
        </div>
      )}

      {/* Search + status filter */}
      <div className="flex flex-wrap items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('routePlanner.adminSearch')} className="h-9 max-w-xs" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as RoutePlannerStatus | 'all')} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="all">{t('routePlanner.adminFilterAll')}</option>
          <option value="trial">{t('routePlanner.adminStatusTrial')}</option>
          <option value="active">{t('routePlanner.adminStatusActive')}</option>
          <option value="expired">{t('routePlanner.adminStatusExpired')}</option>
          <option value="suspended">{t('routePlanner.adminStatusSuspended')}</option>
        </select>
        <span className="text-xs text-muted-foreground">{rows.length} / {allRows.length}</span>
      </div>

      {/* Tenants */}
      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-[11px] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start font-normal">{t('routePlanner.adminColName')}</th>
                <th className="px-3 py-2 text-start font-normal">{t('routePlanner.adminColStatus')}</th>
                <th className="px-3 py-2 text-end font-normal">{t('routePlanner.adminColDaysLeft')}</th>
                <th className="px-3 py-2 text-end font-normal">{t('routePlanner.adminColCustomers')}</th>
                <th className="px-3 py-2 text-end font-normal">{t('routePlanner.adminColRoutes')}</th>
                <th className="px-3 py-2 text-end font-normal">{t('routePlanner.adminColLastActivity')}</th>
                <th className="px-3 py-2 text-end font-normal">{t('routePlanner.adminColActions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">{t('routePlanner.adminNoTenants')}</td></tr>}
              {rows.map(({ c, view }) => {
                const suspended = view.status === 'suspended';
                const lastAct = c.lastActivity ?? c.updatedAt;
                return (
                  <tr key={c.id} className="border-b last:border-0 align-middle">
                    <td className="px-3 py-2 font-medium">{c.name}<span className="block text-[10px] font-normal text-muted-foreground">{view.plan}</span></td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_SKIN[view.status]}`}>
                        {view.status === 'trial' || view.status === 'active' ? <CheckCircle2 className="h-3 w-3" /> : view.status === 'suspended' ? <Ban className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {t(`routePlanner.adminStatus${view.status[0].toUpperCase()}${view.status.slice(1)}` as Parameters<typeof t>[0])}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums" dir="ltr">{view.isActive && view.daysRemaining > 0 ? `${view.daysRemaining}d` : '—'}</td>
                    <td className="px-3 py-2 text-end tabular-nums" dir="ltr">{c.customerCount ?? '—'}</td>
                    <td className="px-3 py-2 text-end tabular-nums" dir="ltr">{c.routeCount ?? '—'}</td>
                    <td className="px-3 py-2 text-end tabular-nums text-muted-foreground" dir="ltr">{lastAct ? new Date(lastAct).toISOString().slice(0, 10) : '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        <button disabled={pending} onClick={() => run(() => extendTrial(c.id, 30), (x) => ({ ...x, planKey: 'route_planner_trial', isActive: true, trialEndsAt: isoIn(30), subscriptionEnd: null }), c.id)} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"><Clock className="h-3 w-3" /> {t('routePlanner.adminExtendTrial')}</button>
                        <button disabled={pending} onClick={() => run(() => activateSubscription(c.id, 'monthly'), (x) => ({ ...x, planKey: 'route_planner_monthly', isActive: true, subscriptionStart: new Date().toISOString(), subscriptionEnd: isoIn(30) }), c.id)} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"><CheckCircle2 className="h-3 w-3" /> {t('routePlanner.adminActivate')}</button>
                        <button disabled={pending} onClick={() => run(() => setTenantSuspended(c.id, !suspended), (x) => ({ ...x, isActive: suspended }), c.id)} className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50 ${suspended ? '' : 'text-red-600'}`}><Ban className="h-3 w-3" /> {suspended ? t('routePlanner.adminReactivate') : t('routePlanner.adminSuspend')}</button>
                        <button disabled={pending} onClick={() => { if (confirm(t('routePlanner.adminResetConfirm'))) run(() => resetDemoData(c.id), (x) => ({ ...x, planKey: 'route_planner_trial', isActive: true, trialEndsAt: isoIn(30), subscriptionStart: null, subscriptionEnd: null, customerCount: 0, routeCount: 0 }), c.id); }} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"><RotateCcw className="h-3 w-3" /> {t('routePlanner.adminResetDemo')}</button>
                        <button disabled={pending} onClick={() => openAddUser(c)} className="inline-flex items-center gap-1 rounded border border-primary/40 px-2 py-1 text-[11px] text-primary hover:bg-primary/10 disabled:opacity-50"><UserPlus className="h-3 w-3" /> {t('routePlanner.adminAddUser')}</button>
                        <a href="/distribution/route-planner" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] hover:bg-muted"><ExternalLink className="h-3 w-3" /> {t('routePlanner.adminOpenCompany')}</a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent></Card>

      {pending && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('routePlanner.adminWorking')}</p>}

      <p className="text-[11px] text-muted-foreground">{t('routePlanner.adminScopeNote')}</p>

      {/* Add User modal */}
      {addUserFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAddUserFor(null)}>
          <div className="w-full max-w-sm rounded-xl border bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold">{t('routePlanner.adminAddUser')} · <span className="font-medium text-muted-foreground">{addUserFor.name}</span></p>
              <button onClick={() => setAddUserFor(null)} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            {createdCreds ? (
              <div className="space-y-3">
                <p className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600"><CheckCircle2 className="h-4 w-4" /> {t('routePlanner.adminUserCreated')}</p>
                <div className="space-y-1 rounded-md border bg-muted/40 p-2 font-mono text-xs">
                  <p>email: <b>{createdCreds.email}</b></p>
                  <p>password: <b>{createdCreds.password}</b></p>
                </div>
                <p className="text-[11px] text-muted-foreground">{t('routePlanner.adminUserCredsNote')}</p>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(`${createdCreds.email} / ${createdCreds.password}`).then(() => toast.success(t('routePlanner.copiedNumber'))).catch(() => {}); }}>{t('routePlanner.copyNumber')}</Button>
                  <Button size="sm" onClick={() => setAddUserFor(null)}>{t('routePlanner.adminUserDone')}</Button>
                </div>
              </div>
            ) : (
            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] text-muted-foreground">{t('routePlanner.adminUserName')}</label>
                <Input value={uName} onChange={(e) => setUName(e.target.value)} className="h-9" />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground">{t('routePlanner.adminUserEmail')}</label>
                <Input value={uEmail} onChange={(e) => setUEmail(e.target.value)} type="email" dir="ltr" className="h-9" placeholder="user@company.com" />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground">{t('routePlanner.adminUserPassword')}</label>
                <Input value={uPassword} onChange={(e) => setUPassword(e.target.value)} type="text" dir="ltr" className="h-9" placeholder="min 6 chars" />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground">{t('routePlanner.adminUserRole')}</label>
                <select value={uRole} onChange={(e) => setURole(e.target.value as 'admin' | 'user')} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                  <option value="user">{t('routePlanner.adminRoleUser')}</option>
                  <option value="admin">{t('routePlanner.adminRoleAdmin')}</option>
                </select>
              </div>
              {actionError && <p className="rounded border border-red-300 bg-red-50 px-2 py-1 font-mono text-[11px] text-red-700">{actionError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="ghost" onClick={() => setAddUserFor(null)}>{t('routePlanner.adminUserCancel')}</Button>
                <Button size="sm" onClick={submitAddUser} disabled={pending || !uEmail.trim() || uPassword.length < 6}><UserPlus className="h-4 w-4" /> {t('routePlanner.adminUserCreate')}</Button>
              </div>
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
