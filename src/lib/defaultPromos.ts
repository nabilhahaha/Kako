export interface PromoConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  startDate: string;
  endDate: string;
  skuKeyword: string;
  method: 'per-cust-cap' | 'per-case' | 'per-case-min-cust' | 'free-goods';
  minSkus: number;
  minCases: number;
  perCustAmount: number;
  capCustCount: number;
  perCaseAmount: number;
  minCustomers: number;
  isDefault: boolean;
}

export const DEFAULT_PROMOS: PromoConfig[] = [
  {
    id: 'lovita-april-2026',
    name: 'Lovita Salesman Incentive — April 2026',
    description: 'Sell 3 different Lovita SKUs (>=1 cs each) per customer → 10 SAR. Cap at 20 customers = 500 SAR.',
    icon: '🍫',
    startDate: '2026-04-01',
    endDate: '2026-04-30',
    skuKeyword: 'Lovita',
    method: 'per-cust-cap',
    minSkus: 3,
    minCases: 1,
    perCustAmount: 10,
    capCustCount: 20,
    perCaseAmount: 0,
    minCustomers: 0,
    isDefault: true,
  },
  {
    id: 'johnny-coconut-may-2026',
    name: 'Johnny Krocker Coconut — May 2026',
    description: 'Sell to 15+ different customers (>=1 cs each) → 4 SAR per case sold (NET).',
    icon: '🥥',
    startDate: '2026-05-01',
    endDate: '2026-05-31',
    skuKeyword: 'Johnny Krocker Coconut',
    method: 'per-case-min-cust',
    minSkus: 1,
    minCases: 1,
    perCustAmount: 0,
    capCustCount: 0,
    perCaseAmount: 4,
    minCustomers: 15,
    isDefault: true,
  },
];
