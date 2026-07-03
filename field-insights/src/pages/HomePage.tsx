import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Play, Lightbulb, AlertTriangle, CheckSquare, Camera, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

const quickCapture = [
  { icon: Lightbulb, label: 'Opportunity' },
  { icon: AlertTriangle, label: 'Issue' },
  { icon: CheckSquare, label: 'Action' },
  { icon: Camera, label: 'Photo' },
  { icon: Users, label: 'Competitor' },
] as const;

export function HomePage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-semibold">{t('home.greeting')}</h1>
        <p className="text-sm text-muted-foreground">{t('home.todaysVisits')}: 0 · {t('home.actionsDue')}: 0</p>
      </div>

      <Button asChild size="lg" className="w-full">
        <Link to="/visits/new">
          <Play className="size-5" /> {t('home.startVisit')}
        </Link>
      </Button>

      <section className="fi-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Quick capture (from any visit)</h2>
        <div className="grid grid-cols-3 gap-3">
          {quickCapture.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-1.5 rounded-lg bg-secondary/60 p-3 text-center text-xs font-medium fi-tap"
            >
              <Icon className="size-5 text-primary" />
              {label}
            </div>
          ))}
        </div>
      </section>

      <section className="fi-card p-4">
        <h2 className="mb-1 text-sm font-semibold">No visits yet</h2>
        <p className="text-sm text-muted-foreground">
          Start a visit to capture photos, competitor intelligence, opportunities, issues, and
          actions — all working offline.
        </p>
      </section>
    </div>
  );
}
