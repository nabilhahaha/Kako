import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  back?: boolean | string;
}

export function PageHeader({ title, description, actions, back }: PageHeaderProps) {
  const navigate = useNavigate();

  function handleBack() {
    if (typeof back === 'string') navigate(back);
    else navigate(-1);
  }

  return (
    <div className="flex flex-col gap-3 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        {back && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            aria-label="رجوع"
            className="mt-0.5 shrink-0"
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
        <div className="space-y-1">
          <h1 className="text-h1 text-foreground">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
