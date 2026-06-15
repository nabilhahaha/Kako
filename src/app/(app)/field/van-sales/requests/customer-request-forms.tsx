'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UserPlus, FileEdit, MapPin, Send, LocateFixed, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n/provider';
import { distanceMeters } from '@/lib/erp/journey-sort';
import { requestCustomerChange, type RequestCustomer } from '@/lib/van-sales/requests-server';

type Open = 'new' | 'update' | 'gps' | null;

const UPDATE_FIELDS = ['name', 'phone', 'city', 'address', 'cr_number', 'tax_number', 'credit_limit', 'payment_terms_days'] as const;
type UpdateField = (typeof UPDATE_FIELDS)[number];

function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  });
}

export function CustomerRequestForms({ customers }: { customers: RequestCustomer[] }) {
  const { t, locale } = useI18n();
  const ar = locale === 'ar';
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const cName = (c: RequestCustomer) => (ar && c.name_ar ? c.name_ar : c.name);

  // New customer
  const [nc, setNc] = useState({ name: '', mobile: '', activity: '', city: '', cr: '', vat: '', notes: '' });
  const [ncGps, setNcGps] = useState<{ lat: number; lng: number } | null>(null);

  // Data update
  const [upCust, setUpCust] = useState('');
  const [upField, setUpField] = useState<UpdateField>('phone');
  const [upNew, setUpNew] = useState('');
  const [upReason, setUpReason] = useState('');

  // GPS correction
  const [gpsCust, setGpsCust] = useState('');
  const [gpsNew, setGpsNew] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsReason, setGpsReason] = useState('');

  const selectedUp = customers.find((c) => c.id === upCust) ?? null;
  const selectedGps = customers.find((c) => c.id === gpsCust) ?? null;
  const currentValue = (() => {
    if (!selectedUp) return '';
    const v = (selectedUp as unknown as Record<string, unknown>)[upField];
    return v == null ? '' : String(v);
  })();
  const gpsDistance = (selectedGps && selectedGps.latitude != null && selectedGps.longitude != null && gpsNew)
    ? distanceMeters({ latitude: selectedGps.latitude, longitude: selectedGps.longitude }, { latitude: gpsNew.lat, longitude: gpsNew.lng })
    : null;

  async function captureGps(set: (v: { lat: number; lng: number }) => void) {
    const pos = await getCurrentPosition();
    if (!pos) { toast.error(t('vanSales.requests.gpsFailed')); return; }
    set(pos);
  }

  async function submit(kind: 'new_customer' | 'data_update' | 'gps_correction', customerId: string | null, payload: Record<string, unknown>, validate: () => string | null) {
    const err = validate();
    if (err) { toast.error(err); return; }
    setBusy(true);
    try {
      const res = await requestCustomerChange({ kind, customerId, payload });
      if (!res.ok) { toast.error(res.error ?? '—'); return; }
      toast.success(t('vanSales.requests.submitted'));
      setOpen(null);
      setNc({ name: '', mobile: '', activity: '', city: '', cr: '', vat: '', notes: '' }); setNcGps(null);
      setUpCust(''); setUpNew(''); setUpReason('');
      setGpsCust(''); setGpsNew(null); setGpsReason('');
      router.refresh();
    } finally { setBusy(false); }
  }

  const tile = (key: Open, icon: ReactNode, title: string, desc: string) => (
    <Card>
      <CardContent className="py-4">
        <button type="button" className="flex w-full items-center gap-3 text-start" onClick={() => setOpen(open === key ? null : key)}>
          {icon}
          <div className="flex-1">
            <div className="text-sm font-medium">{title}</div>
            <div className="text-xs text-muted-foreground">{desc}</div>
          </div>
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${open === key ? 'rotate-90' : 'rtl:rotate-180'}`} />
        </button>
        {open === key && <div className="mt-3 space-y-3 border-t pt-3">{form(key)}</div>}
      </CardContent>
    </Card>
  );

  function form(key: Open) {
    if (key === 'new') {
      return (
        <>
          <Field label={t('vanSales.requests.f_name') + ' *'}><Input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} /></Field>
          <Field label={t('vanSales.requests.f_mobile')}><Input inputMode="tel" value={nc.mobile} onChange={(e) => setNc({ ...nc, mobile: e.target.value })} /></Field>
          <Field label={t('vanSales.requests.f_activity')}><Input value={nc.activity} onChange={(e) => setNc({ ...nc, activity: e.target.value })} /></Field>
          <Field label={t('vanSales.requests.f_city')}><Input value={nc.city} onChange={(e) => setNc({ ...nc, city: e.target.value })} /></Field>
          <GpsRow value={ncGps} onCapture={() => captureGps(setNcGps)} />
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('vanSales.requests.f_cr')}><Input value={nc.cr} onChange={(e) => setNc({ ...nc, cr: e.target.value })} /></Field>
            <Field label={t('vanSales.requests.f_vat')}><Input value={nc.vat} onChange={(e) => setNc({ ...nc, vat: e.target.value })} /></Field>
          </div>
          <Field label={t('vanSales.requests.f_notes')}><Input value={nc.notes} onChange={(e) => setNc({ ...nc, notes: e.target.value })} /></Field>
          <SubmitBtn busy={busy} onClick={() => submit('new_customer', null, {
            name: nc.name, mobile: nc.mobile, activity: nc.activity, city: nc.city, cr: nc.cr, vat: nc.vat, notes: nc.notes,
            latitude: ncGps?.lat ?? '', longitude: ncGps?.lng ?? '',
          }, () => (!nc.name.trim() ? t('vanSales.requests.nameRequired') : null))} label={t('vanSales.requests.submit')} submitting={t('vanSales.requests.submitting')} />
        </>
      );
    }
    if (key === 'update') {
      return (
        <>
          <Field label={t('vanSales.requests.pickCustomer')}>
            <Select value={upCust} onChange={(e) => setUpCust(e.target.value)}>
              <option value="">{t('vanSales.requests.pickCustomer')}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{cName(c)} · {c.code}</option>)}
            </Select>
          </Field>
          <Field label={t('vanSales.requests.field')}>
            <Select value={upField} onChange={(e) => setUpField(e.target.value as UpdateField)}>
              {UPDATE_FIELDS.map((f) => <option key={f} value={f}>{t(`vanSales.requests.fld.${f}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('vanSales.requests.currentValue')}><Input value={currentValue} readOnly disabled /></Field>
          <Field label={t('vanSales.requests.newValue')}><Input value={upNew} onChange={(e) => setUpNew(e.target.value)} /></Field>
          <Field label={t('vanSales.requests.reason')}><Input value={upReason} onChange={(e) => setUpReason(e.target.value)} /></Field>
          <SubmitBtn busy={busy} onClick={() => submit('data_update', upCust, {
            field: upField, current_value: currentValue, new_value: upNew, reason: upReason,
          }, () => (!upCust ? t('vanSales.requests.customerRequired') : !upNew.trim() ? t('vanSales.requests.newValueRequired') : !upReason.trim() ? t('vanSales.requests.reasonRequired') : null))} label={t('vanSales.requests.submit')} submitting={t('vanSales.requests.submitting')} />
        </>
      );
    }
    if (key === 'gps') {
      return (
        <>
          <Field label={t('vanSales.requests.pickCustomer')}>
            <Select value={gpsCust} onChange={(e) => { setGpsCust(e.target.value); setGpsNew(null); }}>
              <option value="">{t('vanSales.requests.pickCustomer')}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{cName(c)} · {c.code}</option>)}
            </Select>
          </Field>
          <div className="text-xs text-muted-foreground" dir="ltr">
            {t('vanSales.requests.currentLocation')}: {selectedGps?.latitude != null ? `${selectedGps.latitude}, ${selectedGps.longitude}` : '—'}
          </div>
          <GpsRow value={gpsNew} onCapture={() => captureGps(setGpsNew)} />
          {gpsDistance != null && <div className="text-xs font-medium" dir="ltr">{t('vanSales.requests.distance')}: {gpsDistance} m</div>}
          <Field label={t('vanSales.requests.reason')}><Input value={gpsReason} onChange={(e) => setGpsReason(e.target.value)} /></Field>
          <SubmitBtn busy={busy} onClick={() => submit('gps_correction', gpsCust, {
            current_lat: selectedGps?.latitude ?? '', current_lng: selectedGps?.longitude ?? '',
            new_lat: gpsNew?.lat ?? '', new_lng: gpsNew?.lng ?? '', distance_m: gpsDistance ?? '', reason: gpsReason,
          }, () => (!gpsCust ? t('vanSales.requests.customerRequired') : !gpsNew ? t('vanSales.requests.gpsRequired') : !gpsReason.trim() ? t('vanSales.requests.reasonRequired') : null))} label={t('vanSales.requests.submit')} submitting={t('vanSales.requests.submitting')} />
        </>
      );
    }
    return null;
  }

  return (
    <div className="space-y-3">
      {tile('new', <UserPlus className="h-5 w-5 text-primary" />, t('vanSales.requests.newCustomer'), t('vanSales.requests.newCustomerDesc'))}
      {tile('update', <FileEdit className="h-5 w-5 text-primary" />, t('vanSales.requests.updateData'), t('vanSales.requests.updateDataDesc'))}
      {tile('gps', <MapPin className="h-5 w-5 text-primary" />, t('vanSales.requests.fixLocation'), t('vanSales.requests.fixLocationDesc'))}
    </div>
  );

  function GpsRow({ value, onCapture }: { value: { lat: number; lng: number } | null; onCapture: () => void }) {
    return (
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCapture}><LocateFixed className="h-4 w-4" /> {t('vanSales.requests.useMyLocation')}</Button>
        <span className="text-xs text-muted-foreground" dir="ltr">{value ? `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : t('vanSales.requests.gpsNotSet')}</span>
      </div>
    );
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
function SubmitBtn({ busy, onClick, label, submitting }: { busy: boolean; onClick: () => void; label: string; submitting: string }) {
  return <Button className="w-full" disabled={busy} onClick={onClick}><Send className="h-4 w-4" /> {busy ? submitting : label}</Button>;
}
