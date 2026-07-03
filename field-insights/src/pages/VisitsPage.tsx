import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocalVisits } from '@/lib/data/visits';

export function VisitsPage() {
  const visits = useLocalVisits();

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Visits</h1>
        <Button asChild size="sm">
          <Link to="/visits/new"><Plus className="size-4" /> New</Link>
        </Button>
      </div>

      {(!visits || visits.length === 0) && (
        <div className="fi-card p-4 text-sm text-muted-foreground">
          No visits yet on this device. Tap “New” to start one — it works offline.
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {visits?.map((v) => (
          <li key={v.id}>
            <Link to={`/visits/${v.id}`} className="fi-card flex items-center justify-between p-3 fi-tap">
              <div>
                <p className="font-medium">{v.customer_name ?? 'Visit'}</p>
                <p className="text-xs text-muted-foreground">
                  {v.visit_type.replace(/_/g, ' ')} · {v.status}
                </p>
              </div>
              <span
                className={
                  v.sync_status === 'synced'
                    ? 'text-xs text-success'
                    : v.sync_status === 'failed'
                      ? 'text-xs text-destructive'
                      : 'text-xs text-warning-foreground'
                }
              >
                {v.sync_status === 'synced' ? '✓ synced' : v.sync_status === 'failed' ? '⚠ failed' : '⏳ pending'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
