import { useState, useMemo, useCallback, useRef, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Plus, X, AlertTriangle, ShieldAlert, Camera, Info } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/PageHeader';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';
import { checkOverlap, checkPriorSpend } from '@/lib/trade-spend/engine';
import type {
  Campaign,
  CampaignBranch,
  DurationKey,
  PeriodMode,
  CustomerClassification,
} from '@/lib/trade-spend/types';
import { DURATION_MAP } from '@/lib/trade-spend/types';
import { addMonths, addDays, format, parseISO } from 'date-fns';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const CLASSIFICATION_OPTIONS: { value: CustomerClassification; labelKey: string }[] = [
  { value: 'wholesale', labelKey: 'campaign.wholesale' },
  { value: 'discounter', labelKey: 'campaign.discounter' },
  { value: 'roastery', labelKey: 'campaign.roastery' },
  { value: 'grocery', labelKey: 'campaign.grocery' },
  { value: 'sweets', labelKey: 'campaign.sweets' },
];

const DURATION_OPTIONS: { value: DurationKey; labelKey: string }[] = [
  { value: 'none', labelKey: 'campaign.none' },
  { value: '1m', labelKey: 'campaign.oneMonth' },
  { value: '3m', labelKey: 'campaign.threeMonths' },
  { value: '6m', labelKey: 'campaign.sixMonths' },
  { value: '1y', labelKey: 'campaign.oneYear' },
];

const fmt = (d: Date): string => format(d, 'yyyy-MM-dd');

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function NewRequestPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  /* ---- Store ---- */
  const customers = useTradeSpendStore((s) => s.customers);
  const items = useTradeSpendStore((s) => s.items);
  const spendTypes = useTradeSpendStore((s) => s.spendTypes);
  const campaigns = useTradeSpendStore((s) => s.campaigns);
  const latestDataDate = useTradeSpendStore((s) => s.latestDataDate);
  const currentUser = useTradeSpendStore((s) => s.currentUser);
  const addCampaign = useTradeSpendStore((s) => s.addCampaign);
  const addSpendType = useTradeSpendStore((s) => s.addSpendType);
  const updateCustomerClassification = useTradeSpendStore((s) => s.updateCustomerClassification);

  /* ---- Form state ---- */
  const [selectedAccount, setSelectedAccount] = useState('');
  const [classification, setClassification] = useState<string>('');
  const [customClassification, setCustomClassification] = useState('');
  const [useCustomClassification, setUseCustomClassification] = useState(false);

  const [spendType, setSpendType] = useState('');
  const [showNewSpendType, setShowNewSpendType] = useState(false);
  const [newSpendTypeName, setNewSpendTypeName] = useState('');

  const [durationKey, setDurationKey] = useState<DurationKey>('none');

  const [itemSearch, setItemSearch] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  const [spendAmount, setSpendAmount] = useState<number>(0);
  const [startDate, setStartDate] = useState('');
  const [roshenPct, setRoshenPct] = useState<number>(50);

  const [periodMode, setPeriodMode] = useState<PeriodMode>('match');
  const [customDays, setCustomDays] = useState<number>(30);
  const [beforeStart, setBeforeStart] = useState('');
  const [beforeEnd, setBeforeEnd] = useState('');
  const [afterStart, setAfterStart] = useState('');
  const [afterEnd, setAfterEnd] = useState('');

  const [branchCount, setBranchCount] = useState<number>(1);
  const [branches, setBranches] = useState<{ name: string; photoUrl: string }[]>([
    { name: '', photoUrl: '' },
  ]);

  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const photoInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  /* ---- Derived data ---- */
  const filteredItems = useMemo(() => {
    if (!itemSearch.trim()) return items.slice(0, 20);
    const q = itemSearch.toLowerCase();
    return items
      .filter(
        (it) =>
          it.id.toLowerCase().includes(q) ||
          it.description.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [items, itemSearch]);

  const durationMonths = DURATION_MAP[durationKey];

  /* ---- Cost split ---- */
  const roshenShare = useMemo(
    () => (spendAmount * roshenPct) / 100,
    [spendAmount, roshenPct],
  );
  const distributorShare = useMemo(
    () => spendAmount - roshenShare,
    [spendAmount, roshenShare],
  );

  /* ---- Overlap & prior-spend checks ---- */
  const overlapResult = useMemo(() => {
    if (!selectedAccount || selectedItemIds.length === 0) {
      return { blocked: false, conflicts: [] };
    }
    return checkOverlap(
      { account: selectedAccount, item_ids: selectedItemIds },
      campaigns,
      latestDataDate,
    );
  }, [selectedAccount, selectedItemIds, campaigns, latestDataDate]);

  const priorSpendResult = useMemo(() => {
    if (!selectedAccount || selectedItemIds.length === 0) return [];
    return checkPriorSpend(selectedAccount, selectedItemIds, campaigns);
  }, [selectedAccount, selectedItemIds, campaigns]);

  /* ---- Computed comparison periods ---- */
  const computedPeriods = useMemo(() => {
    if (!startDate) return null;
    try {
      const start = parseISO(startDate);
      if (periodMode === 'match') {
        if (durationMonths == null) return null;
        return {
          before_start: fmt(addMonths(start, -durationMonths)),
          before_end: fmt(start),
          after_start: fmt(start),
          after_end: fmt(addMonths(start, durationMonths)),
        };
      }
      if (periodMode === 'days') {
        return {
          before_start: fmt(addDays(start, -customDays)),
          before_end: fmt(start),
          after_start: fmt(start),
          after_end: fmt(addDays(start, customDays)),
        };
      }
      if (periodMode === 'dates') {
        return {
          before_start: beforeStart,
          before_end: beforeEnd,
          after_start: afterStart,
          after_end: afterEnd,
        };
      }
    } catch {
      return null;
    }
    return null;
  }, [startDate, periodMode, durationMonths, customDays, beforeStart, beforeEnd, afterStart, afterEnd]);

  /* ---- Helpers ---- */
  const handleSelectCustomer = useCallback(
    (account: string) => {
      setSelectedAccount(account);
      const cust = customers.find((c) => c.account === account);
      if (cust?.classification) {
        const isPreset = CLASSIFICATION_OPTIONS.some(
          (o) => o.value === cust.classification,
        );
        if (isPreset) {
          setClassification(cust.classification);
          setUseCustomClassification(false);
        } else {
          setClassification('custom');
          setCustomClassification(cust.classification);
          setUseCustomClassification(true);
        }
      }
    },
    [customers],
  );

  const handleClassificationChange = useCallback(
    (value: string) => {
      if (value === 'custom') {
        setUseCustomClassification(true);
        setClassification('custom');
      } else {
        setUseCustomClassification(false);
        setClassification(value);
        setCustomClassification('');
        if (selectedAccount) {
          updateCustomerClassification(selectedAccount, value);
        }
      }
    },
    [selectedAccount, updateCustomerClassification],
  );

  const handleCustomClassificationBlur = useCallback(() => {
    if (selectedAccount && customClassification.trim()) {
      updateCustomerClassification(selectedAccount, customClassification.trim());
    }
  }, [selectedAccount, customClassification, updateCustomerClassification]);

  const toggleItem = useCallback((itemId: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId],
    );
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setSelectedItemIds((prev) => prev.filter((id) => id !== itemId));
  }, []);

  const handleAddSpendType = useCallback(() => {
    if (newSpendTypeName.trim()) {
      addSpendType(newSpendTypeName.trim());
      setSpendType(newSpendTypeName.trim());
      setNewSpendTypeName('');
      setShowNewSpendType(false);
    }
  }, [newSpendTypeName, addSpendType]);

  const handleBranchCountChange = useCallback((count: number) => {
    const clamped = Math.max(1, count);
    setBranchCount(clamped);
    setBranches((prev) => {
      const next = [...prev];
      while (next.length < clamped) next.push({ name: '', photoUrl: '' });
      return next.slice(0, clamped);
    });
  }, []);

  const handleBranchNameChange = useCallback((index: number, name: string) => {
    setBranches((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], name };
      return next;
    });
  }, []);

  const handleBranchPhoto = useCallback((index: number, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setBranches((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], photoUrl: reader.result as string };
        return next;
      });
    };
    reader.readAsDataURL(file);
  }, []);

  /* ---- Format number ---- */
  const formatSAR = (n: number) =>
    n.toLocaleString('en-SA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  /* ---- Validate & save ---- */
  const validate = useCallback((): string[] => {
    const errors: string[] = [];
    if (!selectedAccount) errors.push('Customer is required');
    if (selectedItemIds.length === 0) errors.push('At least 1 item must be selected');
    if (spendAmount <= 0) errors.push('Spend amount must be greater than 0');
    if (!startDate) errors.push('Start date is required');
    if (periodMode === 'match' && durationKey === 'none')
      errors.push('Cannot use "Match duration" with open-ended duration');
    if (periodMode === 'days' && customDays <= 0)
      errors.push('Custom days must be greater than 0');
    if (periodMode === 'dates') {
      if (!beforeStart || !beforeEnd || !afterStart || !afterEnd)
        errors.push('All manual date fields are required');
    }
    if (overlapResult.blocked) errors.push('Overlap with active campaign blocks saving');
    return errors;
  }, [
    selectedAccount, selectedItemIds, spendAmount, startDate,
    periodMode, durationKey, customDays,
    beforeStart, beforeEnd, afterStart, afterEnd,
    overlapResult.blocked,
  ]);

  const buildCampaign = useCallback(
    (status: 'draft' | 'pending_distributor'): Campaign => {
      const resolvedClassification = useCustomClassification
        ? customClassification.trim()
        : classification;

      const campaignBranches: CampaignBranch[] = branches.map((b, i) => ({
        id: `branch-${i}`,
        campaign_id: '', // assigned by store
        branch_name: b.name || `Branch ${i + 1}`,
        photo_url: b.photoUrl || undefined,
      }));

      const now = new Date().toISOString();

      return {
        id: '', // assigned by store
        account: selectedAccount,
        classification: resolvedClassification || undefined,
        spend_type: spendType,
        duration_key: durationKey,
        duration_months: durationMonths ?? undefined,
        item_ids: selectedItemIds,
        spend_amount: spendAmount,
        start_date: startDate,
        roshen_pct: roshenPct,
        period_mode: periodMode,
        custom_days: periodMode === 'days' ? customDays : undefined,
        before_start: periodMode === 'dates' ? beforeStart : undefined,
        before_end: periodMode === 'dates' ? beforeEnd : undefined,
        after_start: periodMode === 'dates' ? afterStart : undefined,
        after_end: periodMode === 'dates' ? afterEnd : undefined,
        branch_count: branchCount,
        branches: campaignBranches,
        status,
        created_by: currentUser?.id ?? '',
        created_at: now,
        submitted_at: status === 'pending_distributor' ? now : undefined,
      };
    },
    [
      selectedAccount, classification, customClassification, useCustomClassification,
      spendType, durationKey, durationMonths, selectedItemIds,
      spendAmount, startDate, roshenPct, periodMode, customDays,
      beforeStart, beforeEnd, afterStart, afterEnd,
      branchCount, branches, currentUser,
    ],
  );

  const handleSave = useCallback(
    (status: 'draft' | 'pending_distributor') => {
      const errors = validate();
      if (errors.length > 0) {
        setValidationErrors(errors);
        return;
      }
      setValidationErrors([]);
      const campaign = buildCampaign(status);
      addCampaign(campaign);
      navigate('/trade-spend/requests');
    },
    [validate, buildCampaign, addCampaign, navigate],
  );

  /* ================================================================ */
  /* RENDER                                                            */
  /* ================================================================ */

  return (
    <div className="space-y-6">
      <PageHeader title={t('campaign.title')} back="/trade-spend/requests" />

      {/* ---- Validation errors ---- */}
      {validationErrors.length > 0 && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 space-y-1">
          {validationErrors.map((err, i) => (
            <p key={i} className="text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {err}
            </p>
          ))}
        </div>
      )}

      {/* ============================================================ */}
      {/* 1. Customer Selection                                        */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <CardTitle>{t('campaign.customer')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Customer dropdown */}
            <div className="space-y-2">
              <Label>{t('campaign.customer')}</Label>
              <select
                value={selectedAccount}
                onChange={(e) => {
                  handleSelectCustomer(e.target.value);
                }}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">{t('campaign.searchCustomer')}</option>
                {customers
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((c) => (
                    <option key={c.account} value={c.account}>
                      {c.name} ({c.account})
                    </option>
                  ))}
              </select>
            </div>

            {/* Classification */}
            <div className="space-y-2">
              <Label>{t('campaign.classification')}</Label>
              <select
                className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={useCustomClassification ? 'custom' : classification}
                onChange={(e) => handleClassificationChange(e.target.value)}
              >
                <option value="">--</option>
                {CLASSIFICATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
                <option value="custom">Custom...</option>
              </select>
              {useCustomClassification && (
                <Input
                  placeholder="Enter custom classification"
                  value={customClassification}
                  onChange={(e) => setCustomClassification(e.target.value)}
                  onBlur={handleCustomClassificationBlur}
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* 2. Spend Configuration                                       */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <CardTitle>{t('campaign.spendType')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Spend Type */}
            <div className="space-y-2">
              <Label>{t('campaign.spendType')}</Label>
              <div className="flex gap-2">
                <select
                  className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={spendType}
                  onChange={(e) => setSpendType(e.target.value)}
                >
                  <option value="">--</option>
                  {spendTypes.map((st) => (
                    <option key={st.id} value={st.name}>
                      {st.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setShowNewSpendType(!showNewSpendType)}
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('campaign.addSpendType')}</span>
                </Button>
              </div>
              {showNewSpendType && (
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder={t('campaign.addSpendType')}
                    value={newSpendTypeName}
                    onChange={(e) => setNewSpendTypeName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddSpendType()}
                  />
                  <Button type="button" size="sm" onClick={handleAddSpendType}>
                    {t('common.save')}
                  </Button>
                </div>
              )}
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <Label>{t('campaign.duration')}</Label>
              <div className="flex flex-wrap gap-2">
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      durationKey === opt.value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background hover:bg-accent'
                    }`}
                    onClick={() => {
                      setDurationKey(opt.value);
                      if (opt.value === 'none' && periodMode === 'match') {
                        setPeriodMode('days');
                      }
                    }}
                  >
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
              {durationMonths != null && (
                <p className="text-xs text-muted-foreground">
                  {durationMonths} month{durationMonths > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* 3. Item Selection                                            */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <CardTitle>{t('campaign.selectItems')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t('campaign.searchItems')}
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
            />
          </div>

          {/* Available items */}
          <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
            {filteredItems.map((it) => (
              <label
                key={it.id}
                className="flex items-center gap-3 px-3 py-2 hover:bg-accent cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  checked={selectedItemIds.includes(it.id)}
                  onChange={() => toggleItem(it.id)}
                />
                <span className="text-sm font-mono text-muted-foreground">{it.id}</span>
                <span className="text-sm">{it.description}</span>
              </label>
            ))}
            {filteredItems.length === 0 && (
              <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                {t('common.noData')}
              </p>
            )}
          </div>

          {/* Selected items as badges */}
          {selectedItemIds.length > 0 && (
            <div className="space-y-2">
              <Label>{t('campaign.selectedItems')} ({selectedItemIds.length})</Label>
              <div className="flex flex-wrap gap-2">
                {selectedItemIds.map((id) => {
                  const item = items.find((it) => it.id === id);
                  return (
                    <Badge key={id} variant="secondary" className="gap-1 pr-1">
                      <span>{id}</span>
                      {item && (
                        <span className="text-muted-foreground">
                          - {item.description}
                        </span>
                      )}
                      <button
                        type="button"
                        className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 transition-colors"
                        onClick={() => removeItem(id)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Overlap alert (blocking) */}
          {overlapResult.blocked && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-destructive font-medium">
                <ShieldAlert className="h-5 w-5" />
                {t('campaign.overlapBlocked')}
              </div>
              {overlapResult.conflicts.map((c, i) => (
                <div key={i} className="text-sm text-destructive/90 ml-7 space-y-0.5">
                  <p>
                    <span className="font-medium">{c.campaign_id}</span>
                    {' — '}
                    {t('campaign.overlapItems')}: {c.shared_items.join(', ')}
                  </p>
                  <p>
                    {t('campaign.overlapEnd')}: {c.end_date}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Prior spend notice (informational) */}
          {priorSpendResult.length > 0 && !overlapResult.blocked && (
            <div className="rounded-lg border border-warning bg-warning/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-warning-foreground font-medium">
                <Info className="h-5 w-5" />
                {t('campaign.priorSpendNotice')}
              </div>
              {priorSpendResult.map((ps, i) => (
                <p key={i} className="text-sm ml-7 text-warning-foreground/80">
                  {ps.campaign_id} — Items: {ps.item_ids.join(', ')} (started{' '}
                  {ps.start_date})
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* 4. Financial Details                                         */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <CardTitle>{t('campaign.costSplit')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Spend amount */}
            <div className="space-y-2">
              <Label>{t('campaign.spendAmount')}</Label>
              <Input
                type="number"
                min={0}
                value={spendAmount || ''}
                onChange={(e) => setSpendAmount(Number(e.target.value))}
                placeholder="0"
              />
            </div>

            {/* Start date */}
            <div className="space-y-2">
              <Label>{t('campaign.startDate')}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            {/* Roshen share % */}
            <div className="space-y-2">
              <Label>{t('campaign.roshenPct')}: {roshenPct}%</Label>
              <input
                type="range"
                min={0}
                max={100}
                value={roshenPct}
                onChange={(e) => setRoshenPct(Number(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0%</span>
                <span>100%</span>
              </div>
            </div>
          </div>

          {/* Cost split visualization */}
          {spendAmount > 0 && (
            <div className="space-y-2">
              <Label>{t('campaign.costSplit')}</Label>
              <div className="relative h-10 w-full rounded-lg overflow-hidden border">
                {/* Roshen portion */}
                <div
                  className="absolute inset-y-0 left-0 flex items-center justify-center text-xs font-medium text-white transition-all duration-300"
                  style={{
                    width: `${roshenPct}%`,
                    backgroundColor: '#800020', // maroon
                  }}
                >
                  {roshenPct >= 15 && `${roshenPct}%`}
                </div>
                {/* Distributor portion */}
                <div
                  className="absolute inset-y-0 right-0 flex items-center justify-center text-xs font-medium text-gray-900 transition-all duration-300"
                  style={{
                    width: `${100 - roshenPct}%`,
                    backgroundColor: '#DAA520', // gold
                  }}
                >
                  {100 - roshenPct >= 15 && `${100 - roshenPct}%`}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row justify-between text-sm gap-1">
                <span>
                  <span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ backgroundColor: '#800020' }} />
                  {t('campaign.roshenShare')}: {t('common.currency')} {formatSAR(roshenShare)} ({roshenPct}%)
                </span>
                <span>
                  <span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ backgroundColor: '#DAA520' }} />
                  {t('campaign.distributorShare')}: {t('common.currency')} {formatSAR(distributorShare)} ({100 - roshenPct}%)
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* 5. Comparison Period                                         */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <CardTitle>{t('campaign.periodMode')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Period mode radios */}
          <div className="flex flex-col sm:flex-row gap-3">
            <label
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                periodMode === 'match'
                  ? 'border-primary bg-primary/5'
                  : 'border-input'
              } ${durationKey === 'none' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                type="radio"
                name="periodMode"
                value="match"
                checked={periodMode === 'match'}
                onChange={() => setPeriodMode('match')}
                disabled={durationKey === 'none'}
                className="h-4 w-4"
              />
              <span className="text-sm">{t('campaign.matchDuration')}</span>
            </label>
            <label
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                periodMode === 'days' ? 'border-primary bg-primary/5' : 'border-input'
              }`}
            >
              <input
                type="radio"
                name="periodMode"
                value="days"
                checked={periodMode === 'days'}
                onChange={() => setPeriodMode('days')}
                className="h-4 w-4"
              />
              <span className="text-sm">{t('campaign.customDays')}</span>
            </label>
            <label
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                periodMode === 'dates' ? 'border-primary bg-primary/5' : 'border-input'
              }`}
            >
              <input
                type="radio"
                name="periodMode"
                value="dates"
                checked={periodMode === 'dates'}
                onChange={() => setPeriodMode('dates')}
                className="h-4 w-4"
              />
              <span className="text-sm">{t('campaign.manualDates')}</span>
            </label>
          </div>

          {/* Custom days input */}
          {periodMode === 'days' && (
            <div className="space-y-2 max-w-xs">
              <Label>{t('campaign.days')}</Label>
              <Input
                type="number"
                min={1}
                value={customDays}
                onChange={(e) => setCustomDays(Number(e.target.value))}
              />
            </div>
          )}

          {/* Manual date inputs */}
          {periodMode === 'dates' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <Label className="font-medium">{t('campaign.beforePeriod')}</Label>
                <div className="grid gap-2 grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Start</Label>
                    <Input
                      type="date"
                      value={beforeStart}
                      onChange={(e) => setBeforeStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">End</Label>
                    <Input
                      type="date"
                      value={beforeEnd}
                      onChange={(e) => setBeforeEnd(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <Label className="font-medium">{t('campaign.afterPeriod')}</Label>
                <div className="grid gap-2 grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Start</Label>
                    <Input
                      type="date"
                      value={afterStart}
                      onChange={(e) => setAfterStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">End</Label>
                    <Input
                      type="date"
                      value={afterEnd}
                      onChange={(e) => setAfterEnd(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Computed date ranges */}
          {computedPeriods && (
            <div className="rounded-lg bg-muted/50 p-3 grid gap-2 sm:grid-cols-2 text-sm">
              <div>
                <span className="font-medium">{t('campaign.beforePeriod')}:</span>{' '}
                {computedPeriods.before_start} &rarr; {computedPeriods.before_end}
              </div>
              <div>
                <span className="font-medium">{t('campaign.afterPeriod')}:</span>{' '}
                {computedPeriods.after_start} &rarr; {computedPeriods.after_end}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* 6. Branches                                                  */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <CardTitle>{t('campaign.branches')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-2">
            <Label>{t('campaign.branchCount')}</Label>
            <Input
              type="number"
              min={1}
              value={branchCount}
              onChange={(e) => handleBranchCountChange(Number(e.target.value))}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground w-12">#</th>
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground">
                    {t('campaign.branchName')}
                  </th>
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground w-40">
                    {t('campaign.branchPhoto')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {branches.map((branch, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 px-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 px-2">
                      <Input
                        placeholder={`Branch ${i + 1}`}
                        value={branch.name}
                        onChange={(e) => handleBranchNameChange(i, e.target.value)}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        <input
                          ref={(el) => { photoInputRefs.current[i] = el; }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleBranchPhoto(i, e)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => photoInputRefs.current[i]?.click()}
                        >
                          <Camera className="h-4 w-4" />
                          <span className="hidden sm:inline">{t('campaign.addPhoto')}</span>
                        </Button>
                        {branch.photoUrl && (
                          <img
                            src={branch.photoUrl}
                            alt={branch.name || `Branch ${i + 1}`}
                            className="h-10 w-10 rounded object-cover border"
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* 7. Submit                                                    */}
      {/* ============================================================ */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSave('draft')}
            >
              {t('campaign.saveRequest')}
            </Button>
            <Button
              type="button"
              onClick={() => handleSave('pending_distributor')}
              disabled={overlapResult.blocked}
            >
              {t('campaign.submitForApproval')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
