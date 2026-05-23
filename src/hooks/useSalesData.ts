import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { SalesDataset } from '@/lib/salesTypes';
import { useSalesFilterStore } from '@/stores/salesFilterStore';
import {
  buildFilteredIndices,
  computeKPIs,
  computeKPIsForPeriod,
  computeMonthlySales,
  computeRegionSales,
  computeProductSales,
  computeSalesmanPerformance,
  computeChannelSales,
  stringToDayIndex,
} from '@/lib/salesDataUtils';

async function fetchSalesData(): Promise<SalesDataset> {
  // Check localStorage cache first
  try {
    const cached = localStorage.getItem('roshen_sales_data');
    if (cached) {
      return JSON.parse(cached) as SalesDataset;
    }
  } catch {
    // Corrupted cache; fall through to fetch
  }

  const res = await fetch('/data/sales-data.json');
  if (!res.ok) throw new Error('Failed to load sales data');
  const data: SalesDataset = await res.json();

  // Save to localStorage for future visits
  try {
    localStorage.setItem('roshen_sales_data', JSON.stringify(data));
  } catch {
    // localStorage might be full; silently ignore
  }

  return data;
}

export function useSalesDataset() {
  return useQuery({
    queryKey: ['sales-dataset'],
    queryFn: fetchSalesData,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useFilteredSalesData() {
  const { data: dataset, isLoading, error } = useSalesDataset();
  const filters = useSalesFilterStore();

  const indices = useMemo(() => {
    if (!dataset) return new Uint32Array(0);
    return buildFilteredIndices(dataset, {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      regions: filters.regions,
      channels: filters.channels,
      branches: filters.branches,
      cities: filters.cities,
      categories: filters.categories,
      managers: filters.managers,
      nsms: filters.nsms,
      salesmen: filters.salesmen,
      customers: filters.customers,
      skus: filters.skus,
    });
  }, [dataset, filters.dateFrom, filters.dateTo, filters.regions, filters.channels,
      filters.branches, filters.cities, filters.categories, filters.managers,
      filters.nsms, filters.salesmen, filters.customers, filters.skus]);

  const kpis = useMemo(() => {
    if (!dataset) return null;
    return computeKPIs(dataset, indices);
  }, [dataset, indices]);

  const periodComparison = useMemo(() => {
    if (!dataset) return null;

    const dimensionFilters = {
      regions: filters.regions,
      channels: filters.channels,
      branches: filters.branches,
      cities: filters.cities,
      categories: filters.categories,
      managers: filters.managers,
      nsms: filters.nsms,
      salesmen: filters.salesmen,
      customers: filters.customers,
      skus: filters.skus,
    };

    if (filters.dateFrom && filters.dateTo) {
      const curFrom = stringToDayIndex(filters.dateFrom);
      const curTo = stringToDayIndex(filters.dateTo);
      const periodLength = curTo - curFrom;
      const prevTo = curFrom - 1;
      const prevFrom = prevTo - periodLength;
      return {
        currentPeriodKpis: kpis, // when date filter is set, kpis already reflects the current period
        previousKpis: computeKPIsForPeriod(dataset, prevFrom, prevTo, dimensionFilters),
      };
    }

    // No date filter: compare last 30 days vs 30 days before that
    const refDay = stringToDayIndex(dataset.meta.dateMax);
    const curTo = refDay;
    const curFrom = refDay - 29;
    const prevTo = curFrom - 1;
    const prevFrom = prevTo - 29;

    return {
      currentPeriodKpis: computeKPIsForPeriod(dataset, curFrom, curTo, dimensionFilters),
      previousKpis: computeKPIsForPeriod(dataset, prevFrom, prevTo, dimensionFilters),
    };
  }, [dataset, kpis, filters.dateFrom, filters.dateTo, filters.regions, filters.channels,
      filters.branches, filters.cities, filters.categories, filters.managers,
      filters.nsms, filters.salesmen, filters.customers, filters.skus]);

  const monthlySales = useMemo(() => {
    if (!dataset) return [];
    return computeMonthlySales(dataset, indices);
  }, [dataset, indices]);

  const regionSales = useMemo(() => {
    if (!dataset) return [];
    return computeRegionSales(dataset, indices);
  }, [dataset, indices]);

  const productSales = useMemo(() => {
    if (!dataset) return [];
    return computeProductSales(dataset, indices);
  }, [dataset, indices]);

  const salesmanPerformance = useMemo(() => {
    if (!dataset) return [];
    return computeSalesmanPerformance(dataset, indices);
  }, [dataset, indices]);

  const channelSales = useMemo(() => {
    if (!dataset) return [];
    return computeChannelSales(dataset, indices);
  }, [dataset, indices]);

  return {
    dataset,
    isLoading,
    error,
    indices,
    kpis,
    previousKpis: periodComparison?.previousKpis ?? null,
    currentPeriodKpis: periodComparison?.currentPeriodKpis ?? null,
    monthlySales,
    regionSales,
    productSales,
    salesmanPerformance,
    channelSales,
  };
}
