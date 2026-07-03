import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

async function fetchCustomers() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, channel, health_score, health_band_key')
    .is('deleted_at', null)
    .order('name')
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

export function CustomersPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['customers'], queryFn: fetchCustomers });

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <h1 className="text-xl font-semibold">Customers</h1>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">Could not load customers.</p>}
      {data && data.length === 0 && (
        <div className="fi-card p-4 text-sm text-muted-foreground">
          No customers yet. They appear here once added (scoped to your role and area).
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {data?.map((c) => (
          <li key={c.id} className="fi-card flex items-center justify-between p-3">
            <div>
              <p className="font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.channel ?? '—'}</p>
            </div>
            {c.health_score != null && (
              <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold">
                {c.health_band_key ?? '—'} · {Number(c.health_score).toFixed(0)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
