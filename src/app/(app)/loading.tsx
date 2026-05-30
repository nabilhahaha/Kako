import { PageSkeleton } from '@/components/shared/page-skeleton';

// Shown automatically (inside the app shell) while any app page loads.
export default function Loading() {
  return <PageSkeleton />;
}
