'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n/provider';

export interface VitalsPoint {
  date: string;        // short label
  weight: number | null;
  pulse: number | null;
  temperature: number | null;
  systolic: number | null;
}

export function VitalsTrend({ points }: { points: VitalsPoint[] }) {
  const { t } = useI18n();

  const METRICS: { key: keyof Omit<VitalsPoint, 'date'>; label: string; color: string; unit: string }[] = [
    { key: 'weight', label: t('clinic.vitals.trendWeight'), color: '#2563eb', unit: t('clinic.vitals.weightMetric') },
    { key: 'systolic', label: t('clinic.vitals.trendSystolic'), color: '#dc2626', unit: '' },
    { key: 'pulse', label: t('clinic.vitals.trendPulse'), color: '#16a34a', unit: '' },
    { key: 'temperature', label: t('clinic.vitals.trendTemperature'), color: '#d97706', unit: t('clinic.vitals.temperatureUnit') },
  ];

  // Only render metrics that have at least two recorded values to trend.
  const shown = METRICS.filter((m) => points.filter((p) => p[m.key] != null).length >= 2);
  if (shown.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {shown.map((m) => (
        <Card key={m.key}>
          <CardContent className="p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">{m.label} {m.unit && `(${m.unit})`}</p>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={points} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} reversed />
                <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} width={32} />
                <Tooltip contentStyle={{ fontSize: 12 }} labelStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey={m.key} stroke={m.color} strokeWidth={2} dot={{ r: 3 }} connectNulls name={m.label} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
