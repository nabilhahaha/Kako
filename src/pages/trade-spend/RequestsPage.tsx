import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Eye, CheckCircle, ArrowLeft, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';
import { computeCampaignMetrics } from '@/lib/trade-spend/engine';
import type { CampaignStatus } from '@/lib/trade-spend/types';

const STATUS_COLORS: Record<CampaignStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  pending_distributor: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  pending_roshen: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  changes_requested: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

function formatSAR(n: number): string {
  return `﷼ ${n.toLocaleString('en', { maximumFractionDigits: 0 })}`;
}

export function RequestsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const campaigns = useTradeSpendStore((s) => s.campaigns);
  const transactions = useTradeSpendStore((s) => s.transactions);
  const customers = useTradeSpendStore((s) => s.customers);
  const latestDataDate = useTradeSpendStore((s) => s.latestDataDate);
  const currentUser = useTradeSpendStore((s) => s.currentUser);
  const updateCampaignStatus = useTradeSpendStore((s) => s.updateCampaignStatus);
  const addWorkflowEvent = useTradeSpendStore((s) => s.addWorkflowEvent);

  const userRoles = currentUser?.roles || [];
  const isDeptManager = userRoles.includes('dept_manager');
  const isDistributorTM = userRoles.includes('distributor_trade_mktg');
  const isRoshenApprover = userRoles.includes('roshen_approver');

  const visibleCampaigns = useMemo(() => {
    if (isDeptManager && !isDistributorTM && !isRoshenApprover) {
      return campaigns.filter((c) => c.created_by === currentUser?.id);
    }
    return campaigns;
  }, [campaigns, currentUser, isDeptManager, isDistributorTM, isRoshenApprover]);

  const metricsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeCampaignMetrics>>();
    for (const c of visibleCampaigns) {
      try {
        map.set(c.id, computeCampaignMetrics(c, transactions, latestDataDate));
      } catch {
        // skip if period resolution fails
      }
    }
    return map;
  }, [visibleCampaigns, transactions, latestDataDate]);

  const getCustomerName = (account: string) =>
    customers.find((c) => c.account === account)?.name || account;

  const canApproveDistributor = (c: typeof campaigns[0]) =>
    isDistributorTM && c.status === 'pending_distributor';

  const canApproveRoshen = (c: typeof campaigns[0]) =>
    isRoshenApprover && c.status === 'pending_roshen';

  const handleApproveDistributor = (campaignId: string) => {
    const campaign = campaigns.find((c) => c.id === campaignId);
    if (!campaign) return;
    const allBranchesHavePhotos = campaign.branches.every((b) => b.photo_url);
    if (!allBranchesHavePhotos && campaign.branches.length > 0) {
      alert(t('campaign.photosRequired'));
      return;
    }
    updateCampaignStatus(campaignId, 'pending_roshen');
    addWorkflowEvent({
      campaign_id: campaignId,
      actor_user_id: currentUser?.id || '',
      action: 'approved_distributor',
    });
  };

  const handleApproveRoshen = (campaignId: string) => {
    updateCampaignStatus(campaignId, 'approved');
    addWorkflowEvent({
      campaign_id: campaignId,
      actor_user_id: currentUser?.id || '',
      action: 'approved_roshen',
    });
  };

  const handleRequestChanges = (campaignId: string) => {
    const campaign = campaigns.find((c) => c.id === campaignId);
    if (!campaign) return;
    if (campaign.status === 'pending_roshen') {
      updateCampaignStatus(campaignId, 'pending_distributor');
    } else if (campaign.status === 'pending_distributor') {
      updateCampaignStatus(campaignId, 'changes_requested');
    }
    addWorkflowEvent({
      campaign_id: campaignId,
      actor_user_id: currentUser?.id || '',
      action: 'changes_requested',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="heading-1">{t('workflow.inbox')}</h1>
        <Button onClick={() => navigate('/trade-spend/new-request')} size="sm">
          {t('nav.newRequest')}
        </Button>
      </div>

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
          return (
            <Card key={campaign.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base font-semibold">
                      {campaign.id}
                    </CardTitle>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[campaign.status]}`}
                    >
                      {t(`status.${campaign.status}`)}
                    </span>
                    {metrics?.is_expiring && (
                      <Badge variant="outline" className="border-warning text-warning gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {t('status.expiring')}
                      </Badge>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {campaign.created_at.substring(0, 10)}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('campaign.customer')}</p>
                    <p className="text-sm font-medium">{getCustomerName(campaign.account)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('campaign.spendType')}</p>
                    <p className="text-sm font-medium">{campaign.spend_type}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('campaign.spendAmount')}</p>
                    <p className="text-sm font-semibold">{formatSAR(campaign.spend_amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('customerDetail.roiRoshen')}</p>
                    <p
                      className={`text-sm font-bold ${
                        metrics?.roi_roshen != null
                          ? metrics.roi_roshen >= 0
                            ? 'text-success'
                            : 'text-destructive'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {metrics?.roi_roshen != null
                        ? `${metrics.roi_roshen.toFixed(1)}%`
                        : '—'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/trade-spend/customers/${campaign.account}`)}
                  >
                    <Eye className="me-1.5 h-3.5 w-3.5" />
                    {t('common.details')}
                  </Button>

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
                        {t('common.approve')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-destructive text-destructive"
                        onClick={() => handleRequestChanges(campaign.id)}
                      >
                        {t('workflow.requestChanges')}
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
