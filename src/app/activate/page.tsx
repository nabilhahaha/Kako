import { notFound } from 'next/navigation';
import { isOffline } from '@/lib/offline/runtime';
import { ActivateForm } from './activate-form';

// Offline-only license activation gate. 404 on the cloud build.
export const dynamic = 'force-dynamic';

export default function ActivatePage() {
  if (!isOffline()) notFound();
  return <ActivateForm />;
}
