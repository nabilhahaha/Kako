import { env, isSupabaseConfigured } from '@/lib/env';

const futureModules = [
  'Competitor Intelligence',
  'Price Monitoring',
  'Merchandising Audits',
  'Route Planning',
  'Trade Marketing Audits',
  'Customer Development Tracking',
];

export function MorePage() {
  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <h1 className="text-xl font-semibold">More</h1>

      <div className="fi-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Status</h2>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>App: {env.appName} (Phase 0 scaffold)</li>
          <li>Backend: {isSupabaseConfigured ? 'Supabase configured' : 'Supabase not yet configured'}</li>
        </ul>
      </div>

      <div className="fi-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Planned modules</h2>
        <ul className="grid grid-cols-1 gap-1.5 text-sm text-muted-foreground">
          {futureModules.map((m) => (
            <li key={m}>• {m}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
