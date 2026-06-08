import { describe, it, expect } from 'vitest';
import {
  ROUTE_RIDING_ENABLED,
  categoryScores, scoreRide, routeComplianceScore, namedCategoryScore, rideBand,
  canTransition, transition, isTerminal, RideTransitionError,
  weaknessHeatmap, scoreEvolution, improvementTrend, trainingRecommendation,
  salesmanDashboard, supervisorDashboard, areaManagerDashboard, regionalDashboard,
  type RideCriterion, type RideEvaluation, type RideSummary,
} from './index';

const criteria: RideCriterion[] = [
  { id: 'c1', category: 'sales_fundamentals', code: 'opening', label: 'Opening', weight: 1, maxScore: 5 },
  { id: 'c2', category: 'sales_fundamentals', code: 'greeting', label: 'Greeting', weight: 1, maxScore: 5 },
  { id: 'c3', category: 'merchandising', code: 'msl', label: 'MSL Compliance', weight: 2, maxScore: 5 },
  { id: 'c4', category: 'merchandising', code: 'osa', label: 'OSA', weight: 1, maxScore: 5 },
];

describe('route-riding/flags', () => {
  it('defaults OFF', () => {
    const prev = process.env.KAKO_ROUTE_RIDING;
    delete process.env.KAKO_ROUTE_RIDING;
    expect(ROUTE_RIDING_ENABLED()).toBe(false);
    process.env.KAKO_ROUTE_RIDING = '1';
    expect(ROUTE_RIDING_ENABLED()).toBe(true);
    if (prev === undefined) delete process.env.KAKO_ROUTE_RIDING; else process.env.KAKO_ROUTE_RIDING = prev;
  });
});

describe('route-riding/scoring (no hardcoded scores/rules)', () => {
  const evals: RideEvaluation[] = [
    { criterionId: 'c1', score: 5 }, { criterionId: 'c2', score: 5 },   // sales_fundamentals = 100
    { criterionId: 'c3', score: 3 }, { criterionId: 'c4', score: 3 },   // merchandising = 60
  ];

  it('rolls criteria → category scores (weighted)', () => {
    const cats = categoryScores(criteria, evals);
    expect(cats.find((c) => c.category === 'sales_fundamentals')!.score).toBe(100);
    expect(cats.find((c) => c.category === 'merchandising')!.score).toBe(60); // (3*2+3*1)/(5*2+5*1)=9/15
  });

  it('rolls categories → overall using category weights', () => {
    const r = scoreRide(criteria, evals);
    // sales_fundamentals weight 2 (1+1) @100, merchandising weight 3 (2+1) @60 → (2*100+3*60)/5 = 76
    expect(r.overall).toBe(76);
    expect(r.band).toBe('silver');
    expect(namedCategoryScore(r, 'merchandising')).toBe(60);
  });

  it('honours company category-weight overrides', () => {
    const r = scoreRide(criteria, evals, { categoryWeights: { sales_fundamentals: 0, merchandising: 1 } });
    expect(r.overall).toBe(60); // only merchandising counts
  });

  it('route compliance + banding', () => {
    expect(routeComplianceScore(10, 8)).toBe(80);
    expect(routeComplianceScore(0, 0)).toBeNull();
    expect(rideBand(95)).toBe('gold');
    expect(rideBand(0, false)).toBe('none');
  });
});

describe('route-riding/lifecycle', () => {
  it('enforces the plan→...→closed flow', () => {
    expect(canTransition('planned', 'in_progress')).toBe(true);
    expect(canTransition('completed', 'pending_acknowledgement')).toBe(true);
    expect(canTransition('pending_acknowledgement', 'acknowledged')).toBe(true);
    expect(canTransition('acknowledged', 'closed')).toBe(true);
    expect(canTransition('planned', 'closed')).toBe(false);
    expect(transition('acknowledged', 'closed')).toBe('closed');
    expect(() => transition('closed', 'planned')).toThrow(RideTransitionError);
    expect(isTerminal('closed')).toBe(true);
    expect(isTerminal('planned')).toBe(false);
  });
});

describe('route-riding/analytics + dashboards', () => {
  const rides: RideSummary[] = [
    { rideId: 'r1', salesmanId: 's1', supervisorId: 'sup1', rideType: 'coaching', date: '2026-01-01', status: 'closed', overall: 60, routeCompliancePct: 80, categories: [{ category: 'merchandising', score: 50 }, { category: 'collections', score: 70 }] },
    { rideId: 'r2', salesmanId: 's1', supervisorId: 'sup1', rideType: 'coaching', date: '2026-02-01', status: 'closed', overall: 80, routeCompliancePct: 90, categories: [{ category: 'merchandising', score: 75 }, { category: 'collections', score: 85 }] },
    { rideId: 'r3', salesmanId: 's2', supervisorId: 'sup1', rideType: 'evaluation', date: '2026-02-05', status: 'completed', overall: 40, routeCompliancePct: 60, categories: [{ category: 'merchandising', score: 30 }, { category: 'collections', score: 50 }] },
  ];

  it('weakness heatmap is weakest-first', () => {
    const heat = weaknessHeatmap(rides);
    expect(heat[0].category).toBe('merchandising');
    expect(heat[0].count).toBe(3);
  });

  it('score evolution + improvement trend for a salesman', () => {
    const evo = scoreEvolution(rides, 's1');
    expect(evo.map((e) => e.score)).toEqual([60, 80]);
    expect(improvementTrend(evo)).toBe('improving');
    expect(trainingRecommendation(rides, 's1', 1)).toEqual(['merchandising']);
  });

  it('salesman dashboard', () => {
    const d = salesmanDashboard(rides, 's1');
    expect(d.rideCount).toBe(2);
    expect(d.averageScore).toBe(70);
    expect(d.improvementTrend).toBe('improving');
    expect(d.weakAreas[0]).toBe('merchandising');
  });

  it('supervisor dashboard rolls the team weakest-first', () => {
    const d = supervisorDashboard(rides, 'sup1');
    expect(d.coachingActivities).toBe(3);
    expect(d.teamMembers[0].salesmanId).toBe('s2'); // lowest avg first
  });

  it('area + regional dashboards', () => {
    const a = areaManagerDashboard(rides);
    expect(a.rideRidingCoverage).toBe(1);
    expect(a.supervisorEffectiveness[0].supervisorId).toBe('sup1');
    const r = regionalDashboard(rides, 6);
    expect(r.completionPct).toBe(50); // 3 completed-or-beyond (r1/r2 closed, r3 completed) of 6 planned
    expect(r.trainingNeeds[0]).toBe('merchandising');
  });
});
