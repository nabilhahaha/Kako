import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { SalesDataset } from '@/lib/salesTypes';
import { useSalesFilterStore } from '@/stores/salesFilterStore';
import {
  buildFilteredIndices,
  computeKPIs,
  computeMonthlySales,
  computeRegionSales,
  computeProductSales,
  computeSalesmanPerformance,
  computeChannelSales,
} from '@/lib/salesDataUtils';

async function fetchSalesData(): Promise<SalesDataset> {
  const res = await fetch('/data/sales-data.json');
  if (!res.ok) throw new Error('Failed to load sales data');
  return res.json();
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
    monthlySales,
    regionSales,
    productSales,
    salesmanPerformance,
    channelSales,
  };
}
