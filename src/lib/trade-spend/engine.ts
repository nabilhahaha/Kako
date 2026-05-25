import {
  addMonths,
  addDays,
  differenceInDays,
  parseISO,
  format,
  isBefore,
} from 'date-fns';
import type {
  Campaign,
  SalesTransaction,
  CampaignMetrics,
} from './types';
import { DURATION_MAP } from './types';

const fmt = (d: Date): string => format(d, 'yyyy-MM-dd');

export function resolvePeriods(campaign: Campaign): {
  before_start: string;
  before_end: string;
  after_start: string;
  after_end: string;
} {
  const start = parseISO(campaign.start_date);

  switch (campaign.period_mode) {
    case 'match': {
      const months = campaign.duration_months;
      if (months == null) {
        throw new Error('duration_months is required for period_mode "match"');
      }
      return {
        before_start: fmt(addMonths(start, -months)),
        before_end: fmt(start),
        after_start: fmt(start),
        after_end: fmt(addMonths(start, months)),
      };
    }
    case 'days': {
      const n = campaign.custom_days!;
      return {
        before_start: fmt(addDays(start, -n)),
        before_end: fmt(start),
        after_start: fmt(start),
        after_end: fmt(addDays(start, n)),
      };
    }
    case 'dates': {
      return {
        before_start: campaign.before_start!,
        before_end: campaign.before_end!,
        after_start: campaign.after_start!,
        after_end: campaign.after_end!,
      };
    }
  }
}

export function computeSalesSums(
  transactions: SalesTransaction[],
  account: string,
  itemIds: string[],
  startDate: string,
  endDate: string,
): { value: number; cases: number } {
  const filterByItem = itemIds.length > 0;
  const itemSet = new Set(itemIds);

  let value = 0;
  let cases = 0;

  for (const tx of transactions) {
    if (tx.account !== account) continue;
    if (filterByItem && !itemSet.has(tx.item_id)) continue;
    if (tx.date < startDate || tx.date >= endDate) continue;

    value += tx.value_ex_vat;
    cases += tx.cases;
  }

  return { value, cases };
}

export function computeCampaignMetrics(
  campaign: Campaign,
  transactions: SalesTransaction[],
  latestDataDate: string,
): CampaignMetrics {
  const periods = resolvePeriods(campaign);

  const selectedBefore = computeSalesSums(
    transactions, campaign.account, campaign.item_ids,
    periods.before_start, periods.before_end,
  );
  const selectedAfter = computeSalesSums(
    transactions, campaign.account, campaign.item_ids,
    periods.after_start, periods.after_end,
  );
  const allBefore = computeSalesSums(
    transactions, campaign.account, [],
    periods.before_start, periods.before_end,
  );
  const allAfter = computeSalesSums(
    transactions, campaign.account, [],
    periods.after_start, periods.after_end,
  );

  const uplift_value = selectedAfter.value - selectedBefore.value;
  const uplift_cases = selectedAfter.cases - selectedBefore.cases;
  const uplift_pct = selectedBefore.value !== 0
    ? (uplift_value / Math.abs(selectedBefore.value)) * 100
    : null;

  const roshen_share = (campaign.spend_amount * campaign.roshen_pct) / 100;
  const distributor_share = campaign.spend_amount - roshen_share;

  const roi_total = campaign.spend_amount !== 0
    ? ((uplift_value - campaign.spend_amount) / campaign.spend_amount) * 100
    : null;

  const roi_roshen = roshen_share !== 0
    ? ((uplift_value - roshen_share) / roshen_share) * 100
    : null;

  const spend_to_sales_pct = selectedAfter.value !== 0
    ? (roshen_share / selectedAfter.value) * 100
    : null;

  const afterPeriodDays = differenceInDays(
    parseISO(periods.after_end),
    parseISO(periods.after_start),
  );

  const annualized_roi_roshen =
    roi_roshen != null && afterPeriodDays > 0
      ? roi_roshen * (365 / afterPeriodDays)
      : null;

  const payback_days =
    uplift_value > 0 && afterPeriodDays > 0
      ? roshen_share / (uplift_value / afterPeriodDays)
      : null;

  const spend_per_incremental_case =
    uplift_cases > 0 ? roshen_share / uplift_cases : null;

  const realized_price_before =
    selectedBefore.cases !== 0
      ? selectedBefore.value / selectedBefore.cases
      : null;

  const realized_price_after =
    selectedAfter.cases !== 0
      ? selectedAfter.value / selectedAfter.cases
      : null;

  const restBeforeValue = allBefore.value - selectedBefore.value;
  const restAfterValue = allAfter.value - selectedAfter.value;
  const cannibalization_flag =
    uplift_value > 0 && (restAfterValue - restBeforeValue) < 0;

  const afterEnd = parseISO(periods.after_end);
  const latest = parseISO(latestDataDate);
  const is_complete = !isBefore(latest, afterEnd);
  const total_days = afterPeriodDays;
  const captured_days = is_complete
    ? total_days
    : Math.max(0, differenceInDays(latest, parseISO(periods.after_start)));

  let result_status: 'running' | 'win' | 'loss';
  if (!is_complete) {
    result_status = 'running';
  } else if (roi_roshen != null && roi_roshen >= 0) {
    result_status = 'win';
  } else {
    result_status = 'loss';
  }

  let is_expiring = false;
  if (campaign.duration_months != null) {
    const campaignEnd = addMonths(parseISO(campaign.start_date), campaign.duration_months);
    const daysUntilEnd = differenceInDays(campaignEnd, latest);
    is_expiring = daysUntilEnd >= 0 && daysUntilEnd <= 7;
  }

  return {
    selected_before_value: selectedBefore.value,
    selected_after_value: selectedAfter.value,
    all_before_value: allBefore.value,
    all_after_value: allAfter.value,
    selected_before_cases: selectedBefore.cases,
    selected_after_cases: selectedAfter.cases,
    all_before_cases: allBefore.cases,
    all_after_cases: allAfter.cases,
    uplift_value,
    uplift_cases,
    uplift_pct,
    roshen_share,
    distributor_share,
    roi_total,
    roi_roshen,
    spend_to_sales_pct,
    annualized_roi_roshen,
    payback_days,
    spend_per_incremental_case,
    realized_price_before,
    realized_price_after,
    cannibalization_flag,
    data_completeness: { captured_days, total_days, is_complete },
    result_status,
    is_expiring,
  };
}

export function checkOverlap(
  newCampaign: { account: string; item_ids: string[] },
  existingCampaigns: Campaign[],
  latestDataDate: string,
): {
  blocked: boolean;
  conflicts: Array<{ campaign_id: string; shared_items: string[]; end_date: string }>;
} {
  const newItems = new Set(newCampaign.item_ids);
  const conflicts: Array<{ campaign_id: string; shared_items: string[]; end_date: string }> = [];

  for (const c of existingCampaigns) {
    if (c.account !== newCampaign.account) continue;
    if (c.duration_key === 'none') continue;

    const months = DURATION_MAP[c.duration_key];
    if (months == null) continue;

    const endDate = fmt(addMonths(parseISO(c.start_date), months));
    if (endDate <= latestDataDate) continue;

    const shared = c.item_ids.filter((id) => newItems.has(id));
    if (shared.length === 0) continue;

    conflicts.push({
      campaign_id: c.id,
      shared_items: shared,
      end_date: endDate,
    });
  }

  return { blocked: conflicts.length > 0, conflicts };
}

export function checkPriorSpend(
  account: string,
  itemIds: string[],
  existingCampaigns: Campaign[],
): Array<{ campaign_id: string; item_ids: string[]; start_date: string }> {
  const targetItems = new Set(itemIds);
  const results: Array<{ campaign_id: string; item_ids: string[]; start_date: string }> = [];

  for (const c of existingCampaigns) {
    if (c.account !== account) continue;

    const shared = c.item_ids.filter((id) => targetItems.has(id));
    if (shared.length === 0) continue;

    results.push({
      campaign_id: c.id,
      item_ids: shared,
      start_date: c.start_date,
    });
  }

  return results;
}
