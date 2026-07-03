import { Link } from 'react-router-dom';
import { Users, LogOut, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/stores/session';
import { useAuth } from '@/lib/auth';
import { ROLE_LABELS } from '@/lib/rbac';

const futureModules = [
  'Competitor Intelligence',
  'Price Monitoring',
  'Merchandising Audits',
  'Route Planning',
  'Trade Marketing Audits',
  'Customer Development Tracking',
];

export function MorePage() {
  const profile = useSession((s) => s.profile);
  const { signOut } = useAuth();

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <h1 className="text-xl font-semibold">More</h1>

      {profile && (
        <div className="fi-card p-4">
          <p className="font-medium">{profile.fullName || profile.email}</p>
          <p className="text-sm text-muted-foreground">{ROLE_LABELS[profile.role]}</p>
        </div>
      )}

      <Link to="/customers" className="fi-card flex items-center justify-between p-4 fi-tap">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Users className="size-4 text-primary" /> Customers
        </span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>

      <div className="fi-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Planned modules</h2>
        <ul className="grid grid-cols-1 gap-1.5 text-sm text-muted-foreground">
          {futureModules.map((m) => (
            <li key={m}>• {m}</li>
          ))}
        </ul>
      </div>

      <Button variant="outline" onClick={() => void signOut()}>
        <LogOut className="size-4" /> Sign out
      </Button>
    </div>
  );
}
