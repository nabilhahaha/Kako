import { create } from 'zustand';
import type { SalesFilters } from '@/lib/salesTypes';

interface SalesFilterState extends SalesFilters {
  setDateRange: (from: string | null, to: string | null) => void;
  toggleDimension: (dim: keyof Omit<SalesFilters, 'dateFrom' | 'dateTo'>, value: number) => void;
  setDimension: (dim: keyof Omit<SalesFilters, 'dateFrom' | 'dateTo'>, values: number[]) => void;
  resetAll: () => void;
}

const initialFilters: SalesFilters = {
  dateFrom: null,
  dateTo: null,
  regions: [],
  channels: [],
  branches: [],
  cities: [],
  categories: [],
  managers: [],
  nsms: [],
  salesmen: [],
  customers: [],
  skus: [],
};

export const useSalesFilterStore = create<SalesFilterState>((set) => ({
  ...initialFilters,
  setDateRange: (from, to) => set({ dateFrom: from, dateTo: to }),
  toggleDimension: (dim, value) =>
    set((state) => {
      const current = state[dim] as number[];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { [dim]: next };
    }),
  setDimension: (dim, values) => set({ [dim]: values }),
  resetAll: () => set(initialFilters),
}));
