import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCustomers, createVisit } from '@/lib/data/visits';
import { useGeolocation } from '@/hooks/useGeolocation';

const VISIT_TYPES: { value: string; label: string }[] = [
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'new_customer', label: 'New Customer' },
  { value: 'competitor_check', label: 'Competitor Check' },
  { value: 'market_survey', label: 'Market Survey' },
  { value: 'merchandising_audit', label: 'Merchandising Audit' },
  { value: 'complaint_investigation', label: 'Complaint Investigation' },
  { value: 'trade_marketing_visit', label: 'Trade Marketing Visit' },
  { value: 'distributor_visit', label: 'Distributor Visit' },
];

export function StartVisitPage() {
  const navigate = useNavigate();
  const { data: customers } = useCustomers();
  const geo = useGeolocation();
  const [customerId, setCustomerId] = useState('');
  const [visitType, setVisitType] = useState('follow_up');
  const [objective, setObjective] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!customerId) {
      toast.error('Select a customer');
      return;
    }
    setSaving(true);
    const customerName = customers?.find((c) => c.id === customerId)?.name ?? null;
    const id = await createVisit({
      customerId,
      customerName,
      visitType,
      objective: objective.trim() || null,
      latitude: geo.fix?.latitude ?? null,
      longitude: geo.fix?.longitude ?? null,
      accuracy: geo.fix?.accuracy ?? null,
    });
    toast.success('Visit started');
    navigate(`/visits/${id}`);
  }

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <h1 className="text-xl font-semibold">Start visit</h1>

      <label className="text-sm font-medium">
        Customer
        <Select className="mt-1" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Select customer…</option>
          {customers?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </label>

      <label className="text-sm font-medium">
        Visit type
        <Select className="mt-1" value={visitType} onChange={(e) => setVisitType(e.target.value)}>
          {VISIT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </label>

      <div className="fi-card flex items-center justify-between p-3">
        <div className="text-sm">
          {geo.fix ? (
            <span className="text-success">
              GPS {geo.fix.latitude.toFixed(4)}, {geo.fix.longitude.toFixed(4)} ±{Math.round(geo.fix.accuracy)}m
            </span>
          ) : (
            <span className="text-muted-foreground">{geo.error ?? 'GPS not captured'}</span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => void geo.capture()} disabled={geo.busy}>
          {geo.busy ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
          Capture
        </Button>
      </div>

      <label className="text-sm font-medium">
        Objective (optional)
        <Textarea className="mt-1" value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="What's the goal of this visit?" />
      </label>

      <Button size="lg" onClick={() => void save()} disabled={saving}>
        Save & start
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Saved instantly — works offline and syncs automatically.
      </p>
    </div>
  );
}
