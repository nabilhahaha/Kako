// Raw customer data from Excel import
export interface RawCustomer {
  customerNo: string;
  customerNameE: string;
  customerNameA: string;
  latitude: number;
  longitude: number;
  city: string;
  dynamicCity: string;
  branch: string;
  newBranch: string;
  monthlyVisits: number;
  inactive: boolean;
  salesmanName: string;
  address: string;
  customerType: string;
  supervisor: string;
  salesManCategory: string;
}

// Cleaned customer ready for optimization
export interface Customer {
  index: number;
  customerNo: string;
  customerNameE: string;
  customerNameA: string;
  lat: number;
  lng: number;
  city: string;
  branch: string;
  monthlyVisits: number;
  weeklyFreq: number;
  salesmanName: string;
  customerType: string;
}

// Optimization parameters
export interface OptimizationParams {
  distributionMethod: 'count' | 'workload';
  numberOfRoutes: number;
  customersPerRoute: number;
  workingDaysPerWeek: 4 | 5 | 6;
  avgVisitTime: number; // minutes
  workingHoursPerDay: number;
  avgSpeed: number; // km/h
  frequencySource: 'automatic' | 'uniform';
  uniformFrequency: 1 | 2 | 3;
  outlierDistance: number; // km, 0 = disabled
  createOutstationRoutes: boolean;
  outlierLinkDistance: number; // km
  dailyKmCap: number; // 0 = no cap
}

// Depot/start point for a route
export interface Depot {
  lat: number;
  lng: number;
  source: 'manual' | 'map' | 'customer';
  customerIndex?: number;
}

// Day plan within a route
export interface DayPlan {
  dayIndex: number;
  dayName: string;
  customerIndices: number[];
  sequencedCustomers: Customer[];
  distanceKm: number;
  travelTimeHours: number;
  visitTimeHours: number;
  totalHours: number;
  googleMapsUrl: string;
}

// Complete route result
export interface RouteResult {
  routeIndex: number;
  routeType: 'normal' | 'outstation';
  customers: Customer[];
  depot: Depot | null;
  totalCustomers: number;
  weeklyKm: number;
  monthlyKm: number;
  avgDailyHours: number;
  sellingTimeRatio: number;
  dailyPlans: DayPlan[];
  warnings: string[];
  color: string;
}

// Overall KPIs
export interface KPIs {
  totalRoutes: number;
  distributedCustomers: number;
  monthlyVisits: number;
  monthlyDistance: number;
  loadBalancePercent: number;
  avgSellingTime: number;
  unassignedCount: number;
  overloadedRoutes: number;
}

// Full optimization result
export interface OptimizationResult {
  routes: RouteResult[];
  outstationRoutes: RouteResult[];
  unassignedCustomers: Customer[];
  needsDecision: Customer[];
  kpis: KPIs;
}

// Worker message types
export interface WorkerRequest {
  type: 'optimize';
  customers: Customer[];
  params: OptimizationParams;
}

export interface WorkerProgress {
  type: 'progress';
  step: string;
  percent: number;
}

export interface WorkerResult {
  type: 'result';
  result: OptimizationResult;
}

export interface WorkerError {
  type: 'error';
  message: string;
}

export type WorkerMessage = WorkerProgress | WorkerResult | WorkerError;

// App state
export type AppStep = 'import' | 'scope' | 'params' | 'optimizing' | 'results';

export interface AppState {
  step: AppStep;
  rawCustomers: RawCustomer[];
  customers: Customer[];
  scopeCity: string;
  scopeBranch: string;
  excludeInactive: boolean;
  params: OptimizationParams;
  result: OptimizationResult | null;
  depots: Map<number, Depot>;
}
