import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

/**
 * SectionCard — a titled configuration card for the center panel. Admin detail
 * tabs are composed of small SectionCards (never one long form). No logic.
 */
export function SectionCard({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
