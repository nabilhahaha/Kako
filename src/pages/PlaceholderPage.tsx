import { Construction } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';

interface PlaceholderPageProps {
  title: string;
  description?: string;
  phase: number;
}

export function PlaceholderPage({ title, description, phase }: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={Construction}
        title="قيد التطوير"
        description={`هذه الشاشة سيتم بناؤها في المرحلة ${phase}.`}
      />
    </div>
  );
}
