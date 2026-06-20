import type { Metadata } from 'next';
import { PlannerLanding } from './planner-landing';

export const metadata: Metadata = {
  title: 'VANTORA Route Planner — Plan FMCG sales territories',
  description: 'Upload customers, split routes geographically, review them on the map, and export to Excel. A standalone FMCG territory-planning product with a 30-day free trial.',
};

/** Public marketing landing for the standalone Route Planner product. */
export default function PlannerMarketingPage() {
  return <PlannerLanding />;
}
