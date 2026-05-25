import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Eye,
  CheckCircle,
  ArrowLeft,
  AlertTriangle,
  Camera,
  MessageSquare,
  Clock,
  Image,
  ChevronDown,
  ChevronUp,
  PlusCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';
import { computeCampaignMetrics } from '@/lib/trade-spend/engine';
import type { CampaignStatus, WorkflowAction } from '@/lib/trade-spend/types';

const STATUS_COLORS: Record<CampaignStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  pending_distributor: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  pending_roshen: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  approved_pending_photos: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300',
  photos_submitted: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
  final_approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  changes_requested: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  rejected: 'bg-red-200 text-red-800 dark:bg-red-950 dark:text-red-400',
};

const STATUS_ORDER: CampaignStatus[] = [
  'pending_distributor',
  'pending_roshen',
  'approved_pending_photos',
  'photos_submitted',
  'changes_requested',
  'draft',
  'final_approved',
  'rejected',
];

const ACTION_LABELS: Record<WorkflowAction, string> = {
  created: 'Created',
  submitted: 'Submitted for approval',
  edited: 'Edited',
  changes_requested: 'Changes requested',
  approved_distributor: 'Approved by Distributor',
  approved_roshen: 'Budget approved by Roshen',
  photos_added: 'Execution photos submitted',
  final_approved: 'Final approval by Roshen',
  rejected: 'Rejected',
  returned: 'Returned',
};

function formatSAR(n: number): string {
  return `﷼ ${n.toLocaleString('en', { maximumFractionDigits: 0 })}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function RequestsPage() {
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

  const [statusFilter, setStatusFilter] = useState<CampaignStatus | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  const userRoles = currentUser?.roles || [];
  const isDeptManager = userRoles.includes('dept_manager');
  const isDistributorTM = userRoles.includes('distributor_trade_mktg');
  const isRoshenApprover = userRoles.includes('roshen_approver');
  const isAdmin = userRoles.includes('admin');
  const isViewer = userRoles.includes('viewer');
  const isPrivileged = isRoshenApprover;

  const visibleCampaigns = useMemo(() => {
    let list = campaigns;

    // Role-based filtering
    if (isAdmin) {
      // admin sees everything
    } else if (isViewer) {
      // viewer sees all (read-only)
    } else if (isRoshenApprover) {
      // roshen_approver sees campaigns pending_roshen and photos_submitted
      list = list.filter((c) => c.status === 'pending_roshen' || c.status === 'photos_submitted');
    } else if (isDistributorTM) {
      // distributor sees pending_distributor or campaigns they need to action
      list = list.filter(
        (c) =>
          c.status === 'pending_distributor' ||
          c.created_by === currentUser?.id,
      );
    } else if (isDeptManager) {
      // dept_manager sees ONLY their own campaigns
      list = list.filter((c) => c.created_by === currentUser?.id);
    }

    if (statusFilter !== 'all') {
      list = list.filter((c) => c.status === statusFilter);
    }
    return [...list].sort((a, b) => {
      const ai = STATUS_ORDER.indexOf(a.status);
      const bi = STATUS_ORDER.indexOf(b.status);
      return ai - bi;
    });
  }, [campaigns, currentUser, isDeptManager, isDistributorTM, isRoshenApprover, isAdmin, isViewer, statusFilter]);

  const metricsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeCampaignMetrics>>();
    for (const c of visibleCampaigns) {
      try {
        map.set(c.id, computeCampaignMetrics(c, transactions, latestDataDate));
      } catch { /* skip */ }
    }
    return map;
  }, [visibleCampaigns, transactions, latestDataDate]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: campaigns.length };
    for (const c of campaigns) {
      counts[c.status] = (counts[c.status] || 0) + 1;
    }
    return counts;
  }, [campaigns]);

  const getCustomerName = (account: string) =>
    customers.find((c) => c.account === account)?.name || account;

  const getUserName = (userId: string) =>
    users.find((u) => u.id === userId)?.display_name || userId;

  const getItemDesc = (itemId: string) =>
    items.find((i) => i.id === itemId)?.description || itemId;

  const canSubmit = (c: typeof campaigns[0]) =>
    (isDeptManager || isDistributorTM || isAdmin) && (c.status === 'draft' || c.status === 'changes_requested');

  const canApproveDistributor = (c: typeof campaigns[0]) =>
    (isDistributorTM || isAdmin) && c.status === 'pending_distributor';

  const canApproveRoshen = (c: typeof campaigns[0]) =>
    isRoshenApprover && c.status === 'pending_roshen';

  const canUploadPhotos = (c: typeof campaigns[0]) =>
    (isDeptManager || isDistributorTM || isAdmin) && c.status === 'approved_pending_photos';

  const canSubmitPhotos = (c: typeof campaigns[0]) =>
    canUploadPhotos(c) && allBranchPhotosPresent(c);

  const canFinalApprove = (c: typeof campaigns[0]) =>
    isRoshenApprover && c.status === 'photos_submitted';

  const allBranchPhotosPresent = (c: typeof campaigns[0]) =>
    c.branches.length === 0 || c.branches.every((b) => b.photo_url);

  const handleSubmit = (campaignId: string) => {
    updateCampaignStatus(campaignId, 'pending_distributor');
    addWorkflowEvent({
      campaign_id: campaignId,
      actor_user_id: currentUser?.id || '',
      action: 'submitted',
      note: noteText || undefined,
    });
    setNoteText('');
  };

  const handleApproveDistributor = (campaignId: string) => {
    const campaign = campaigns.find((c) => c.id === campaignId);
    if (!campaign) return;
    if (!allBranchPhotosPresent(campaign)) return;
    updateCampaignStatus(campaignId, 'pending_roshen');
    addWorkflowEvent({
      campaign_id: campaignId,
      actor_user_id: currentUser?.id || '',
      action: 'approved_distributor',
      note: noteText || undefined,
    });
    setNoteText('');
  };

  const handleApproveRoshen = (campaignId: string) => {
    updateCampaignStatus(campaignId, 'approved_pending_photos');
    addWorkflowEvent({
      campaign_id: campaignId,
      actor_user_id: currentUser?.id || '',
      action: 'approved_roshen',
      note: noteText || undefined,
    });
    setNoteText('');
  };

  const handleSubmitPhotos = (campaignId: string) => {
    updateCampaignStatus(campaignId, 'photos_submitted');
    addWorkflowEvent({
      campaign_id: campaignId,
      actor_user_id: currentUser?.id || '',
      action: 'photos_added',
      note: noteText || undefined,
    });
    setNoteText('');
  };

  const handleFinalApprove = (campaignId: string) => {
    updateCampaignStatus(campaignId, 'final_approved');
    addWorkflowEvent({
      campaign_id: campaignId,
      actor_user_id: currentUser?.id || '',
      action: 'final_approved',
      note: noteText || undefined,
    });
    setNoteText('');
  };

  const handleReject = (campaignId: string) => {
    updateCampaignStatus(campaignId, 'rejected');
    addWorkflowEvent({
      campaign_id: campaignId,
      actor_user_id: currentUser?.id || '',
      action: 'rejected',
      note: noteText || undefined,
    });
    setNoteText('');
  };

  const handleRequestChanges = (campaignId: string) => {
    const campaign = campaigns.find((c) => c.id === campaignId);
    if (!campaign) return;
    if (campaign.status === 'photos_submitted') {
      updateCampaignStatus(campaignId, 'approved_pending_photos');
    } else if (campaign.status === 'pending_roshen') {
      updateCampaignStatus(campaignId, 'pending_distributor');
    } else if (campaign.status === 'pending_distributor') {
      updateCampaignStatus(campaignId, 'changes_requested');
    }
    addWorkflowEvent({
      campaign_id: campaignId,
      actor_user_id: currentUser?.id || '',
      action: 'changes_requested',
      note: noteText || undefined,
    });
    setNoteText('');
  };

  const handleBranchPhotoUpload = (campaignId: string, branchId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      const campaign = campaigns.find((c) => c.id === campaignId);
      if (!campaign) return;
      const updatedBranches = campaign.branches.map((b) =>
        b.id === branchId ? { ...b, photo_url: url } : b,
      );
      updateCampaign(campaignId, { branches: updatedBranches });
    };
    reader.readAsDataURL(file);
  };

  const campaignEvents = (campaignId: string) =>
    workflowEvents
      .filter((e) => e.campaign_id === campaignId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="heading-1">{t('workflow.inbox')}</h1>
        {(isDeptManager || isDistributorTM || isAdmin) && (
          <Button onClick={() => navigate('/trade-spend/new-request')} size="sm">
            <PlusCircle className="me-1.5 h-4 w-4" />
            {t('nav.newRequest')}
          </Button>
        )}
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {(['all', ...STATUS_ORDER] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {s === 'all' ? t('common.all') : t(`status.${s}`)}
            <span className="rounded-full bg-background/20 px-1.5 py-0.5 text-[10px]">
              {statusCounts[s] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Campaign list */}
      {visibleCampaigns.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">{t('common.noData')}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {visibleCampaigns.map((campaign) => {
          const metrics = metricsMap.get(campaign.id);
          const isExpanded = expandedId === campaign.id;
          const events = campaignEvents(campaign.id);
          const photosOk = allBranchPhotosPresent(campaign);

          return (
            <Card key={campaign.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-base font-semibold font-display">
                      {campaign.id}
                    </CardTitle>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[campaign.status]}`}>
                      {t(`status.${campaign.status}`)}
                    </span>
                    {metrics?.is_expiring && (
                      <Badge variant="outline" className="border-warning text-warning gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {t('status.expiring')}
                      </Badge>
                    )}
                    {!photosOk && campaign.branches.length > 0 && (
                      <Badge variant="outline" className="border-amber-500 text-amber-600 gap-1">
                        <Camera className="h-3 w-3" />
                        {t('workflow.noPhotos')}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {campaign.created_at.substring(0, 10)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setExpandedId(isExpanded ? null : campaign.id)}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {/* Summary row */}
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('campaign.customer')}</p>
                    <p className="text-sm font-medium mt-0.5">{getCustomerName(campaign.account)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('campaign.spendType')}</p>
                    <p className="text-sm font-medium mt-0.5">{campaign.spend_type}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('campaign.spendAmount')}</p>
                    <p className="text-sm font-semibold mt-0.5">{formatSAR(campaign.spend_amount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('customerDetail.upliftValue')}</p>
                    <p className={`text-sm font-bold mt-0.5 ${
                      metrics?.uplift_value != null
                        ? metrics.uplift_value >= 0 ? 'text-success' : 'text-destructive'
                        : 'text-muted-foreground'
                    }`}>
                      {metrics?.uplift_value != null ? formatSAR(metrics.uplift_value) : '—'}
                    </p>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="mt-5 space-y-5 border-t pt-5">
                    {/* Items */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">{t('campaign.selectedItems')}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {campaign.item_ids.map((id) => (
                          <Badge key={id} variant="secondary" className="text-xs">
                            {getItemDesc(id)}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Cost split — privileged users only */}
                    {isPrivileged && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">{t('campaign.costSplit')}</p>
                        <div className="flex h-6 rounded-full overflow-hidden">
                          <div
                            className="bg-maroon flex items-center justify-center text-[10px] font-bold text-white transition-all"
                            style={{ width: `${campaign.roshen_pct}%` }}
                          >
                            {campaign.roshen_pct}%
                          </div>
                          <div
                            className="bg-gold flex items-center justify-center text-[10px] font-bold transition-all"
                            style={{ width: `${100 - campaign.roshen_pct}%` }}
                          >
                            {100 - campaign.roshen_pct}%
                          </div>
                        </div>
                        <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                          <span>Roshen: {formatSAR(campaign.spend_amount * campaign.roshen_pct / 100)}</span>
                          <span>{t('campaign.distributorShare')}: {formatSAR(campaign.spend_amount * (100 - campaign.roshen_pct) / 100)}</span>
                        </div>
                      </div>
                    )}

                    {/* Branch photos — editable for distributor TM */}
                    {campaign.branches.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          {t('campaign.branches')} ({campaign.branches.filter(b => b.photo_url).length}/{campaign.branches.length})
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {campaign.branches.map((branch) => (
                            <div key={branch.id} className="rounded-lg border p-2 space-y-2">
                              <p className="text-xs font-medium truncate">{branch.branch_name || '—'}</p>
                              {branch.photo_url ? (
                                <img
                                  src={branch.photo_url}
                                  alt={branch.branch_name}
                                  className="w-full h-24 object-cover rounded"
                                />
                              ) : (
                                <div className="w-full h-24 rounded bg-muted flex items-center justify-center">
                                  <Image className="h-6 w-6 text-muted-foreground" />
                                </div>
                              )}
                              {(isDistributorTM || isAdmin) && !branch.photo_url && (
                                <label className="flex items-center gap-1 text-[10px] text-primary cursor-pointer hover:underline">
                                  <Camera className="h-3 w-3" />
                                  {t('campaign.addPhoto')}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="sr-only"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleBranchPhotoUpload(campaign.id, branch.id, file);
                                    }}
                                  />
                                </label>
                              )}
                            </div>
                          ))}
                        </div>
                        {!photosOk && (isDistributorTM || isAdmin) && (
                          <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {t('workflow.allPhotosRequired')}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Audit trail */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {t('workflow.auditTrail')}
                      </p>
                      {events.length > 0 ? (
                        <div className="space-y-2">
                          {events.map((ev) => (
                            <div key={ev.id} className="flex items-start gap-2 text-xs">
                              <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                              <div>
                                <span className="font-medium">{getUserName(ev.actor_user_id)}</span>
                                {' — '}
                                <span className="text-muted-foreground">
                                  {ACTION_LABELS[ev.action] || ev.action}
                                </span>
                                {ev.note && (
                                  <span className="block text-muted-foreground mt-0.5 italic">"{ev.note}"</span>
                                )}
                                <span className="block text-[10px] text-muted-foreground/70 mt-0.5">
                                  {formatDateTime(ev.timestamp)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">{t('common.noData')}</p>
                      )}
                    </div>

                    {/* Note input + action buttons */}
                    <div className="space-y-3 border-t pt-4">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <Input
                          placeholder={t('workflow.addNote')}
                          value={expandedId === campaign.id ? noteText : ''}
                          onChange={(e) => setNoteText(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/trade-spend/customers/${campaign.account}`)}
                        >
                          <Eye className="me-1.5 h-3.5 w-3.5" />
                          {t('common.details')}
                        </Button>

                        {canSubmit(campaign) && (
                          <Button
                            size="sm"
                            onClick={() => handleSubmit(campaign.id)}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground"
                          >
                            {t('campaign.submitForApproval')}
                          </Button>
                        )}

                        {canApproveDistributor(campaign) && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleApproveDistributor(campaign.id)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              <CheckCircle className="me-1.5 h-3.5 w-3.5" />
                              {t('workflow.approveForward')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-destructive text-destructive"
                              onClick={() => handleRequestChanges(campaign.id)}
                            >
                              <ArrowLeft className="me-1.5 h-3.5 w-3.5" />
                              {t('workflow.returnToManager')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-700 text-red-700"
                              onClick={() => handleReject(campaign.id)}
                            >
                              {t('workflow.reject')}
                            </Button>
                          </>
                        )}

                        {canApproveRoshen(campaign) && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleApproveRoshen(campaign.id)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              <CheckCircle className="me-1.5 h-3.5 w-3.5" />
                              {t('workflow.approveBudget')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-destructive text-destructive"
                              onClick={() => handleRequestChanges(campaign.id)}
                            >
                              {t('workflow.requestChanges')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-700 text-red-700"
                              onClick={() => handleReject(campaign.id)}
                            >
                              {t('workflow.reject')}
                            </Button>
                          </>
                        )}

                        {canSubmitPhotos(campaign) && (
                          <Button
                            size="sm"
                            onClick={() => handleSubmitPhotos(campaign.id)}
                            className="bg-violet-600 hover:bg-violet-700 text-white"
                          >
                            {t('workflow.submitPhotos')}
                          </Button>
                        )}

                        {canFinalApprove(campaign) && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleFinalApprove(campaign.id)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              <CheckCircle className="me-1.5 h-3.5 w-3.5" />
                              {t('workflow.finalApprove')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-amber-600 text-amber-600"
                              onClick={() => handleRequestChanges(campaign.id)}
                            >
                              {t('workflow.returnForPhotos')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-700 text-red-700"
                              onClick={() => handleReject(campaign.id)}
                            >
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
        })}
      </div>
    </div>
  );
}
