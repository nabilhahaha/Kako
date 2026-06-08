// ============================================================================
// Route Riding Excellence — domain types (Phase 3 FMCG). Country/company-agnostic.
// Route Riding is a dedicated coaching + field-execution module (NOT a visit
// field): planning → execution → evaluation → scoring → coaching → acknowledgement
// → follow-up. Reuses the existing visit/journey/GPS/scorecard/attachment surface.
// ============================================================================

/** Ride purpose (company rules may add more via the criteria/config layer). */
export type RideType =
  | 'coaching' | 'evaluation' | 'new_joiner' | 'corrective_action' | 'audit' | 'regional_manager';

/** Ride lifecycle states (see lifecycle.ts for the transition machine). */
export type RideStatus =
  | 'planned' | 'in_progress' | 'completed'
  | 'pending_acknowledgement' | 'acknowledged' | 'closed' | 'cancelled';

/** A configurable evaluation criterion (DATA, not hardcoded). */
export interface RideCriterion {
  id: string;
  category: string;     // 'sales_fundamentals' | 'merchandising' | 'collections' | ...
  code: string;
  label: string;
  weight: number;       // relative weight within its category
  maxScore: number;     // e.g. 5
}

/** A score given for one criterion during a customer evaluation. */
export interface RideEvaluation {
  criterionId: string;
  score: number;        // 0..maxScore
  comment?: string;
}

/** Per-category rolled-up score (0..100). */
export interface CategoryScore {
  category: string;
  score: number;        // 0..100
  weight: number;       // category weight used in the overall rollup
  rawScore: number;     // Σ score
  rawMax: number;       // Σ maxScore
  criteriaCount: number;
}

export type RideBand = 'gold' | 'silver' | 'bronze' | 'none';

/** The scoring engine result for one ride (or one customer within a ride). */
export interface RideScoreResult {
  overall: number;      // 0..100
  band: RideBand;
  hasData: boolean;
  categories: CategoryScore[];
}

/** A coaching action-plan item. */
export interface CoachingAction {
  description: string;
  dueDate?: string | null;        // ISO
  responsibleUserId?: string | null;
  followUp?: boolean;
  status?: 'open' | 'done' | 'cancelled';
}

/** A flattened ride summary used by the analytics/dashboard read-models. */
export interface RideSummary {
  rideId: string;
  salesmanId: string;
  supervisorId: string;
  routeId?: string | null;
  rideType: RideType;
  date: string;                   // ISO date
  status: RideStatus;
  overall: number;                // 0..100
  routeCompliancePct: number | null;
  categories: { category: string; score: number }[];
}
