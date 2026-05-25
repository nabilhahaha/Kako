import { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  XCircle,
  ArrowRight,
  Camera,
  Image,
  MessageSquare,
  Clock,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Send,
  Eye,
  UserCheck,
  Upload,
  Ban,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';
import { computeCampaignMetrics } from '@/lib/trade-spend/engine';
import type { CampaignStatus, Campaign, PeriodMode } from '@/lib/trade-spend/types';

function formatSAR(n: number): string {
  return `﷼ ${n.toLocaleString('en', { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_STYLE: Record<CampaignStatus, { bg: string; dot: string }> = {
  draft: { bg: 'bg-gray-50 dark:bg-gray-900', dot: 'bg-gray-400' },
  pending_distributor: { bg: 'bg-amber-50 dark:bg-amber-950', dot: 'bg-amber-500' },
  pending_roshen: { bg: 'bg-blue-50 dark:bg-blue-950', dot: 'bg-blue-500' },
  approved_pending_photos: { bg: 'bg-violet-50 dark:bg-violet-950', dot: 'bg-violet-500' },
  photos_submitted: { bg: 'bg-cyan-50 dark:bg-cyan-950', dot: 'bg-cyan-500' },
  final_approved: { bg: 'bg-emerald-50 dark:bg-emerald-950', dot: 'bg-emerald-500' },
  changes_requested: { bg: 'bg-red-50 dark:bg-red-950', dot: 'bg-red-500' },
  rejected: { bg: 'bg-red-100 dark:bg-red-950', dot: 'bg-red-700' },
};

function WorkflowStepper({ status }: { status: CampaignStatus }) {
  const { t } = useTranslation();
  const steps = [
    { key: 'draft', label: t('status.draft'), icon: Send },
    { key: 'pending_distributor', label: t('status.pending_distributor'), icon: UserCheck },
    { key: 'pending_roshen', label: t('status.pending_roshen'), icon: ShieldCheck },
    { key: 'approved_pending_photos', label: t('status.approved_pending_photos'), icon: Camera },
    { key: 'final_approved', label: t('status.final_approved'), icon: CheckCircle2 },
  ];

  const statusOrder = ['draft', 'pending_distributor', 'pending_roshen', 'approved_pending_photos', 'photos_submitted', 'final_approved'];
  const currentIdx = status === 'changes_requested' ? 1
    : status === 'rejected' ? -1
    : status === 'photos_submitted' ? 4
    : statusOrder.indexOf(status);

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {status === 'rejected' && (
        <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-300">
          <Ban className="h-3 w-3" />
          <span className="hidden sm:inline">{t('status.rejected')}</span>
        </div>
      )}
      {status !== 'rejected' && steps.map((step, i) => {
        const isComplete = i < currentIdx;
        const isCurrent = i === currentIdx;
        const isChangesRequested = status === 'changes_requested' && i === 1;
        return (
          <div key={step.key} className="flex items-center gap-1 flex-shrink-0">
            <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium transition-all ${
              isChangesRequested
                ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                : isComplete
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                  : isCurrent
                    ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                    : 'bg-muted text-muted-foreground'
            }`}>
              <step.icon className="h-3 w-3" />
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <ArrowRight className={`h-3 w-3 flex-shrink-0 ${isComplete ? 'text-emerald-500' : 'text-muted-foreground/30'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ApprovalsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const campaigns = useTradeSpendStore((s) => s.campaigns);
  const transactions = useTradeSpendStore((s) => s.transactions);
  const customers = useTradeSpendStore((s) => s.customers);
  const items = useTradeSpendStore((s) => s.items);
  const latestDataDate = useTradeSpendStore((s) => s.latestDataDate);
  const currentUser = useTradeSpendStore((s) => s.currentUser);
  const users = useTradeSpendStore((s) => s.users);
  const workflowEvents = useTradeSpendStore((s) => s.workflowEvents);
  const updateCampaignStatus = useTradeSpendStore((s) => s.updateCampaignStatus);
  const updateCampaign = useTradeSpendStore((s) => s.updateCampaign);
  const addWorkflowEvent = useTradeSpendStore((s) => s.addWorkflowEvent);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  // Comparison period state for Roshen setting
  const [cpPeriodMode, setCpPeriodMode] = useState<PeriodMode>('days');
  const [cpCustomDays, setCpCustomDays] = useState<number>(30);
  const [cpBeforeStart, setCpBeforeStart] = useState('');
  const [cpBeforeEnd, setCpBeforeEnd] = useState('');
  const [cpAfterStart, setCpAfterStart] = useState('');
  const [cpAfterEnd, setCpAfterEnd] = useState('');

  const userRoles = currentUser?.roles || [];
  const isDistributorTM = userRoles.includes('distributor_trade_mktg');
  const isRoshenApprover = userRoles.includes('roshen_approver');
  const isAdmin = userRoles.includes('admin');
  const isDeptManager = userRoles.includes('dept_manager');
  const isPrivileged = isRoshenApprover;

  const pendingCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      if ((isDistributorTM || isAdmin) && c.status === 'pending_distributor') return true;
      if ((isRoshenApprover || isAdmin) && c.status === 'pending_roshen') return true;
      if ((isRoshenApprover || isAdmin) && c.status === 'photos_submitted') return true;
      if ((isDeptManager || isDistributorTM || isAdmin) && c.status === 'approved_pending_photos') return true;
      if (isDeptManager && c.created_by === currentUser?.id && c.status === 'changes_requested') return true;
      if (isDeptManager && c.created_by === currentUser?.id && c.status === 'draft') return true;
      return false;
    });
  }, [campaigns, currentUser, isDistributorTM, isRoshenApprover, isAdmin, isDeptManager]);

  const allCampaignsSorted = useMemo(() => {
    const order: Record<string, number> = {
      pending_distributor: 0, pending_roshen: 1, approved_pending_photos: 2, photos_submitted: 3, changes_requested: 4, draft: 5, final_approved: 6, rejected: 7,
    };
    return [...campaigns].sort((a, b) => (order[a.status] ?? 8) - (order[b.status] ?? 8));
  }, [campaigns]);

  const metricsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeCampaignMetrics>>();
    for (const c of campaigns) {
      try { map.set(c.id, computeCampaignMetrics(c, transactions, latestDataDate)); } catch { /* */ }
    }
    return map;
  }, [campaigns, transactions, latestDataDate]);

  const getCustomerName = (account: string) => customers.find((c) => c.account === account)?.name || account;
  const getUserName = (userId: string) => users.find((u) => u.id === userId)?.display_name || userId;
  const getItemDesc = (id: string) => items.find((i) => i.id === id)?.description || id;
  const allBranchPhotosOk = (c: Campaign) => c.branches.length === 0 || c.branches.every((b) => b.photo_url);
  const campaignEvents = (id: string) => workflowEvents.filter((e) => e.campaign_id === id).sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const doAction = (campaignId: string, newStatus: CampaignStatus, action: string) => {
    updateCampaignStatus(campaignId, newStatus);
    addWorkflowEvent({ campaign_id: campaignId, actor_user_id: currentUser?.id || '', action: action as any, note: noteText || undefined });
    setNoteText('');
  };

  const handlePhotoUpload = (campaignId: string, branchId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      const campaign = campaigns.find((c) => c.id === campaignId);
      if (!campaign) return;
      updateCampaign(campaignId, { branches: campaign.branches.map((b) => b.id === branchId ? { ...b, photo_url: url } : b) });
    };
    reader.readAsDataURL(file);
  };

  const handleSaveComparisonPeriod = useCallback((campaignId: string) => {
    const updates: Partial<Campaign> = {
      period_mode: cpPeriodMode,
      custom_days: cpPeriodMode === 'days' ? cpCustomDays : undefined,
      before_start: cpPeriodMode === 'dates' ? cpBeforeStart : undefined,
      before_end: cpPeriodMode === 'dates' ? cpBeforeEnd : undefined,
      after_start: cpPeriodMode === 'dates' ? cpAfterStart : undefined,
      after_end: cpPeriodMode === 'dates' ? cpAfterEnd : undefined,
    };
    updateCampaign(campaignId, updates);
  }, [cpPeriodMode, cpCustomDays, cpBeforeStart, cpBeforeEnd, cpAfterStart, cpAfterEnd, updateCampaign]);

  const pendingCount = pendingCampaigns.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="heading-1 font-display">{t('nav.approvals')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pendingCount > 0
            ? `${pendingCount} ${t('workflow.pendingReview')}`
            : t('common.noData')}
        </p>
      </div>

      {/* Pending approvals section */}
      {pendingCount > 0 && (
        <div className="space-y-2">
          <h2 className="heading-3 text-primary flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            {t('workflow.pendingReview')} ({pendingCount})
          </h2>
          <div className="space-y-3">
            {pendingCampaigns.map((campaign) => renderCampaignCard(campaign, true))}
          </div>
        </div>
      )}

      {/* All campaigns timeline */}
      <div className="space-y-2 mt-8">
        <h2 className="heading-3 text-muted-foreground">{t('common.all')} ({allCampaignsSorted.length})</h2>
        <div className="space-y-3">
          {allCampaignsSorted.map((campaign) => renderCampaignCard(campaign, false))}
        </div>
      </div>
    </div>
  );

  function renderCampaignCard(campaign: Campaign, isPending: boolean) {
    const metrics = metricsMap.get(campaign.id);
    const isExpanded = expandedId === campaign.id;
    const events = campaignEvents(campaign.id);
    const photosOk = allBranchPhotosOk(campaign);
    const style = STATUS_STYLE[campaign.status];

    const canApproveDistributor = (isDistributorTM || isAdmin) && campaign.status === 'pending_distributor';
    const canApproveRoshen = isRoshenApprover && campaign.status === 'pending_roshen';
    const canUploadPhotos = (isDeptManager || isDistributorTM || isAdmin) && campaign.status === 'approved_pending_photos';
    const canFinalApprove = isRoshenApprover && campaign.status === 'photos_submitted';
    const canSubmit = (isDeptManager || isDistributorTM || isAdmin) && (campaign.status === 'draft' || campaign.status === 'changes_requested');

    return (
      <Card
        key={campaign.id}
        className={`overflow-hidden transition-all ${isPending ? 'ring-1 ring-primary/20 shadow-md' : ''} ${style.bg}`}
      >
        <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : campaign.id)}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0 space-y-2">
              {/* Campaign ID + Customer */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold font-display">{campaign.id}</span>
                <span className="text-sm text-muted-foreground">—</span>
                <span className="text-sm font-medium">{getCustomerName(campaign.account)}</span>
              </div>
              {/* Workflow stepper */}
              <WorkflowStepper status={campaign.status} />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {!photosOk && campaign.branches.length > 0 && (
                <Camera className="h-4 w-4 text-amber-500" />
              )}
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {/* Summary metrics */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">{t('campaign.spendType')}</p>
              <p className="text-xs font-semibold mt-0.5">{campaign.spend_type}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">{t('common.amount')}</p>
              <p className="text-xs font-semibold mt-0.5">{formatSAR(campaign.spend_amount)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">{t('customerDetail.upliftValue')}</p>
              <p className={`text-xs font-bold mt-0.5 ${
                metrics?.uplift_value != null
                  ? metrics.uplift_value >= 0 ? 'text-success' : 'text-destructive'
                  : 'text-muted-foreground'
              }`}>
                {metrics?.uplift_value != null ? formatSAR(metrics.uplift_value) : '—'}
              </p>
            </div>
          </div>

          {/* Expanded */}
          {isExpanded && (
            <div className="mt-4 space-y-4 border-t pt-4">
              {/* Items */}
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1.5">{t('campaign.selectedItems')}</p>
                <div className="flex flex-wrap gap-1">
                  {campaign.item_ids.map((id) => (
                    <Badge key={id} variant="secondary" className="text-[10px]">{getItemDesc(id)}</Badge>
                  ))}
                </div>
              </div>

              {/* Cost split — privileged users only */}
              {isPrivileged && (
                <div className="space-y-2">
                  {isRoshenApprover && (campaign.status === 'pending_roshen' || campaign.status === 'pending_distributor') && (
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">Roshen %</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={campaign.roshen_pct}
                        onChange={(e) => {
                          updateCampaign(campaign.id, { roshen_pct: Number(e.target.value) });
                        }}
                        className="flex-1 h-1.5 accent-primary"
                      />
                      <span className="text-xs font-bold tabular-nums w-10 text-end">{campaign.roshen_pct}%</span>
                    </div>
                  )}
                  <div className="flex h-5 rounded-full overflow-hidden text-[9px] font-bold">
                    <div className="bg-maroon text-white flex items-center justify-center" style={{ width: `${campaign.roshen_pct}%` }}>
                      Roshen {campaign.roshen_pct}%
                    </div>
                    <div className="bg-gold flex items-center justify-center" style={{ width: `${100 - campaign.roshen_pct}%` }}>
                      {t('campaign.distributorShare')} {100 - campaign.roshen_pct}%
                    </div>
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>﷼ {(campaign.spend_amount * campaign.roshen_pct / 100).toLocaleString()}</span>
                    <span>﷼ {(campaign.spend_amount * (100 - campaign.roshen_pct) / 100).toLocaleString()}</span>
                  </div>
                </div>
              )}

              {/* Comparison Period — Roshen can SET it at pending_roshen stage */}
              {isRoshenApprover && campaign.status === 'pending_roshen' && (
                <div className="rounded-lg border-2 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 p-3 space-y-3">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {t('campaign.periodMode')}
                  </p>
                  {/* Period mode selector */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <label className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer text-xs transition-colors ${
                      cpPeriodMode === 'match' ? 'border-primary bg-primary/5' : 'border-input bg-background'
                    } ${campaign.duration_key === 'none' ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <input type="radio" name={`cpMode-${campaign.id}`} value="match" checked={cpPeriodMode === 'match'} onChange={() => setCpPeriodMode('match')} disabled={campaign.duration_key === 'none'} className="h-3 w-3" />
                      {t('campaign.matchDuration')}
                    </label>
                    <label className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer text-xs transition-colors ${
                      cpPeriodMode === 'days' ? 'border-primary bg-primary/5' : 'border-input bg-background'
                    }`}>
                      <input type="radio" name={`cpMode-${campaign.id}`} value="days" checked={cpPeriodMode === 'days'} onChange={() => setCpPeriodMode('days')} className="h-3 w-3" />
                      {t('campaign.customDays')}
                    </label>
                    <label className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer text-xs transition-colors ${
                      cpPeriodMode === 'dates' ? 'border-primary bg-primary/5' : 'border-input bg-background'
                    }`}>
                      <input type="radio" name={`cpMode-${campaign.id}`} value="dates" checked={cpPeriodMode === 'dates'} onChange={() => setCpPeriodMode('dates')} className="h-3 w-3" />
                      {t('campaign.manualDates')}
                    </label>
                  </div>
                  {/* Days input */}
                  {cpPeriodMode === 'days' && (
                    <div className="max-w-[200px]">
                      <Label className="text-xs">{t('campaign.days')}</Label>
                      <Input type="number" min={1} value={cpCustomDays} onChange={(e) => setCpCustomDays(Number(e.target.value))} className="h-8 text-xs mt-1" />
                    </div>
                  )}
                  {/* Manual dates input */}
                  {cpPeriodMode === 'dates' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">{t('campaign.beforePeriod')}</Label>
                        <div className="grid grid-cols-2 gap-1">
                          <Input type="date" value={cpBeforeStart} onChange={(e) => setCpBeforeStart(e.target.value)} className="h-7 text-[10px]" />
                          <Input type="date" value={cpBeforeEnd} onChange={(e) => setCpBeforeEnd(e.target.value)} className="h-7 text-[10px]" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">{t('campaign.afterPeriod')}</Label>
                        <div className="grid grid-cols-2 gap-1">
                          <Input type="date" value={cpAfterStart} onChange={(e) => setCpAfterStart(e.target.value)} className="h-7 text-[10px]" />
                          <Input type="date" value={cpAfterEnd} onChange={(e) => setCpAfterEnd(e.target.value)} className="h-7 text-[10px]" />
                        </div>
                      </div>
                    </div>
                  )}
                  <Button size="sm" className="h-7 text-xs" onClick={() => handleSaveComparisonPeriod(campaign.id)}>
                    {t('common.save')}
                  </Button>
                </div>
              )}

              {/* Comparison Period — read-only display when already set and past pending_roshen */}
              {campaign.status !== 'pending_roshen' && campaign.period_mode && (
                <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                  <p className="font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {t('campaign.periodMode')}
                  </p>
                  {campaign.period_mode === 'days' && (
                    <p>{t('campaign.customDays')}: {campaign.custom_days ?? 30} {t('campaign.days')}</p>
                  )}
                  {campaign.period_mode === 'match' && (
                    <p>{t('campaign.matchDuration')}</p>
                  )}
                  {campaign.period_mode === 'dates' && (
                    <p>{t('campaign.beforePeriod')}: {campaign.before_start} — {campaign.before_end} | {t('campaign.afterPeriod')}: {campaign.after_start} — {campaign.after_end}</p>
                  )}
                </div>
              )}

              {/* Photo upload prompt for approved_pending_photos */}
              {canUploadPhotos && (
                <div className="rounded-lg border-2 border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950 p-3 space-y-2">
                  <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
                    <Upload className="h-4 w-4" />
                    {t('workflow.uploadPhotosPrompt')}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {campaign.branches.map((branch) => (
                      <div key={branch.id} className="rounded-lg border p-1.5 space-y-1 bg-background">
                        <p className="text-[10px] font-medium truncate">{branch.branch_name || '—'}</p>
                        {branch.photo_url ? (
                          <img src={branch.photo_url} alt={branch.branch_name} className="w-full h-16 object-cover rounded" />
                        ) : (
                          <div className="w-full h-16 rounded bg-muted flex items-center justify-center">
                            <Image className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        {!branch.photo_url && (
                          <label className="flex items-center gap-1 text-[9px] text-primary cursor-pointer">
                            <Camera className="h-2.5 w-2.5" />
                            {t('campaign.addPhoto')}
                            <input type="file" accept="image/*" className="sr-only" onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handlePhotoUpload(campaign.id, branch.id, f);
                            }} />
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Branch photos (non-upload view) */}
              {!canUploadPhotos && campaign.branches.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1.5">
                    {t('campaign.branches')} ({campaign.branches.filter(b => b.photo_url).length}/{campaign.branches.length})
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {campaign.branches.map((branch) => (
                      <div key={branch.id} className="rounded-lg border p-1.5 space-y-1">
                        <p className="text-[10px] font-medium truncate">{branch.branch_name || '—'}</p>
                        {branch.photo_url ? (
                          <img src={branch.photo_url} alt={branch.branch_name} className="w-full h-16 object-cover rounded" />
                        ) : (
                          <div className="w-full h-16 rounded bg-muted flex items-center justify-center">
                            <Image className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        {(isDistributorTM || isAdmin) && !branch.photo_url && (
                          <label className="flex items-center gap-1 text-[9px] text-primary cursor-pointer">
                            <Camera className="h-2.5 w-2.5" />
                            {t('campaign.addPhoto')}
                            <input type="file" accept="image/*" className="sr-only" onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handlePhotoUpload(campaign.id, branch.id, f);
                            }} />
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Audit trail */}
              {events.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {t('workflow.auditTrail')}
                  </p>
                  <div className="space-y-1.5 ms-2 border-s-2 border-border ps-3">
                    {events.map((ev) => (
                      <div key={ev.id} className="text-[10px]">
                        <span className="font-medium">{getUserName(ev.actor_user_id)}</span>
                        <span className="text-muted-foreground"> — {ev.action.replace(/_/g, ' ')}</span>
                        {ev.note && <span className="block text-muted-foreground italic">"{ev.note}"</span>}
                        <span className="block text-muted-foreground/60">{formatDate(ev.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Note + Actions */}
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <Input
                    placeholder={t('workflow.addNote')}
                    value={expandedId === campaign.id ? noteText : ''}
                    onChange={(e) => setNoteText(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => navigate(`/trade-spend/customers/${campaign.account}`)}>
                    <Eye className="me-1 h-3 w-3" />
                    {t('common.details')}
                  </Button>

                  {canSubmit && (
                    <Button size="sm" className="h-8 text-xs bg-primary" onClick={() => doAction(campaign.id, 'pending_distributor', 'submitted')}>
                      <Send className="me-1 h-3 w-3" />
                      {t('campaign.submitForApproval')}
                    </Button>
                  )}

                  {canApproveDistributor && (
                    <>
                      <Button
                        size="sm"
                        className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => doAction(campaign.id, 'pending_roshen', 'approved_distributor')}
                      >
                        <CheckCircle2 className="me-1 h-3 w-3" />
                        {t('workflow.approveForward')}
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs border-destructive text-destructive" onClick={() => doAction(campaign.id, 'changes_requested', 'changes_requested')}>
                        <XCircle className="me-1 h-3 w-3" />
                        {t('workflow.returnToManager')}
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs border-red-700 text-red-700" onClick={() => doAction(campaign.id, 'rejected', 'rejected')}>
                        <Ban className="me-1 h-3 w-3" />
                        {t('workflow.reject')}
                      </Button>
                    </>
                  )}

                  {canApproveRoshen && (
                    <>
                      <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => doAction(campaign.id, 'approved_pending_photos', 'approved_roshen')}>
                        <CheckCircle2 className="me-1 h-3 w-3" />
                        {t('workflow.approveBudget')}
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs border-destructive text-destructive" onClick={() => doAction(campaign.id, 'pending_distributor', 'changes_requested')}>
                        <XCircle className="me-1 h-3 w-3" />
                        {t('workflow.requestChanges')}
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs border-red-700 text-red-700" onClick={() => doAction(campaign.id, 'rejected', 'rejected')}>
                        <Ban className="me-1 h-3 w-3" />
                        {t('workflow.reject')}
                      </Button>
                    </>
                  )}

                  {canUploadPhotos && photosOk && (
                    <Button size="sm" className="h-8 text-xs bg-violet-600 hover:bg-violet-700 text-white" onClick={() => doAction(campaign.id, 'photos_submitted', 'photos_added')}>
                      <Upload className="me-1 h-3 w-3" />
                      {t('workflow.submitPhotos')}
                    </Button>
                  )}

                  {canFinalApprove && (
                    <>
                      <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => doAction(campaign.id, 'final_approved', 'final_approved')}>
                        <CheckCircle2 className="me-1 h-3 w-3" />
                        {t('workflow.finalApprove')}
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs border-amber-600 text-amber-600" onClick={() => doAction(campaign.id, 'approved_pending_photos', 'returned')}>
                        <XCircle className="me-1 h-3 w-3" />
                        {t('workflow.returnForPhotos')}
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs border-red-700 text-red-700" onClick={() => doAction(campaign.id, 'rejected', 'rejected')}>
                        <Ban className="me-1 h-3 w-3" />
                        {t('workflow.reject')}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
}
