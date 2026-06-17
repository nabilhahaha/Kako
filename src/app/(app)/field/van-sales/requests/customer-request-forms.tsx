'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UserPlus, FileEdit, MapPin, CreditCard, CalendarClock, Shuffle, RotateCcw, Ban, Send, LocateFixed, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n/provider';
import { distanceMeters } from '@/lib/erp/journey-sort';
import { requestCustomerChange, type RequestCustomer, type RequestRoute, type RequestSalesman } from '@/lib/van-sales/requests-server';
import { uploadAttachment } from '@/app/(app)/attachments/actions';

type Open = 'new' | 'update' | 'gps' | 'credit' | 'terms' | 'route' | 'reactivate' | 'close' | null;
type SimpleKind = 'data_update' | 'gps_correction' | 'credit_limit' | 'payment_terms' | 'route_transfer' | 'reactivate' | 'close';

const ACTIVITIES = ['grocery', 'mini_market', 'supermarket', 'wholesale', 'bakery', 'roastery', 'pharmacy', 'other'] as const;
const CLASSES = ['A', 'B', 'C', 'D'] as const;
const CLOSURE_REASONS = ['competitor_won', 'closed_business', 'duplicate', 'relocated', 'other'] as const;
const UPDATE_FIELDS = ['name', 'phone', 'city', 'address', 'cr_number', 'tax_number', 'national_address', 'contact_person', 'credit_limit', 'payment_terms_days'] as const;
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

const NC0 = {
  name: '', owner: '', mobile: '', mobile2: '', activity: '', city: '', district: '',
  na_short: '', building_no: '', additional_no: '', postal_code: '', na_full: '',
  cr: '', vat: '', existing_code: '', competitor: '', expected_monthly_sales: '', classification: '',
  payment_type: '', requested_credit_limit: '', requested_terms: '', notes: '', route_id: '',
};

export function CustomerRequestForms({ customers, routes, salesmen }: { customers: RequestCustomer[]; routes: RequestRoute[]; salesmen: RequestSalesman[] }) {
  const { t, locale } = useI18n();
  const ar = locale === 'ar';
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const cName = (c: RequestCustomer) => (ar && c.name_ar ? c.name_ar : c.name);
  const repName = (id: string | null | undefined) => (id ? (salesmen.find((s) => s.id === id)?.name ?? '—') : '—');
  const routeName = (id: string | null | undefined) => (id ? (routes.find((r) => r.id === id)?.name ?? '—') : '—');

  // New customer
  const [nc, setNc] = useState({ ...NC0 });
  const [ncGps, setNcGps] = useState<{ lat: number; lng: number } | null>(null);
  const [files, setFiles] = useState<{ storefront: File | null; cr: File | null; vat: File | null; na: File | null; other: File | null }>({ storefront: null, cr: null, vat: null, na: null, other: null });
  const setF = (k: keyof typeof files, f: File | null) => setFiles((s) => ({ ...s, [k]: f }));

  // Data update / GPS / credit / terms
  const [upCust, setUpCust] = useState(''); const [upField, setUpField] = useState<UpdateField>('phone'); const [upNew, setUpNew] = useState(''); const [upReason, setUpReason] = useState('');
  const [gpsCust, setGpsCust] = useState(''); const [gpsNew, setGpsNew] = useState<{ lat: number; lng: number } | null>(null); const [gpsReason, setGpsReason] = useState('');
  const [clCust, setClCust] = useState(''); const [clLimit, setClLimit] = useState(''); const [clReason, setClReason] = useState(''); const [clFile, setClFile] = useState<File | null>(null);
  const [ptCust, setPtCust] = useState(''); const [ptTerms, setPtTerms] = useState(''); const [ptReason, setPtReason] = useState(''); const [ptFile, setPtFile] = useState<File | null>(null);
  // Route transfer
  const [rtCust, setRtCust] = useState(''); const [rtRoute, setRtRoute] = useState(''); const [rtReason, setRtReason] = useState('');
  // Reactivate
  const [raCust, setRaCust] = useState(''); const [raReason, setRaReason] = useState(''); const [raNotes, setRaNotes] = useState('');
  // Close
  const [clxCust, setClxCust] = useState(''); const [clxReason, setClxReason] = useState(''); const [clxNotes, setClxNotes] = useState(''); const [clxFile, setClxFile] = useState<File | null>(null);

  const reqRouteRep = routes.find((r) => r.id === rtRoute)?.rep_id ?? null;

  const selectedUp = customers.find((c) => c.id === upCust) ?? null;
  const selectedGps = customers.find((c) => c.id === gpsCust) ?? null;
  const currentValue = selectedUp ? String((selectedUp as unknown as Record<string, unknown>)[upField] ?? '') : '';
  const gpsDistance = (selectedGps?.latitude != null && selectedGps?.longitude != null && gpsNew)
    ? distanceMeters({ latitude: selectedGps.latitude, longitude: selectedGps.longitude }, { latitude: gpsNew.lat, longitude: gpsNew.lng }) : null;

  async function captureGps(set: (v: { lat: number; lng: number }) => void) {
    const pos = await getCurrentPosition();
    if (!pos) { toast.error(t('vanSales.requests.gpsFailed')); return; }
    set(pos);
  }

  function resetAll() {
    setOpen(null); setNc({ ...NC0 }); setNcGps(null); setFiles({ storefront: null, cr: null, vat: null, na: null, other: null });
    setUpCust(''); setUpNew(''); setUpReason(''); setGpsCust(''); setGpsNew(null); setGpsReason('');
    setClCust(''); setClLimit(''); setClReason(''); setClFile(null); setPtCust(''); setPtTerms(''); setPtReason(''); setPtFile(null);
    setRtCust(''); setRtRoute(''); setRtReason(''); setRaCust(''); setRaReason(''); setRaNotes('');
    setClxCust(''); setClxReason(''); setClxNotes(''); setClxFile(null);
  }

  async function uploadFile(reqId: string, file: File | null, docType: string) {
    if (!file) return;
    const fd = new FormData();
    fd.set('entity', 'customer_request'); fd.set('record_id', reqId); fd.set('doc_type', docType); fd.set('file', file);
    await uploadAttachment(fd);
  }

  // Generic submit for the simple kinds (with an optional supporting attachment).
  async function submit(kind: SimpleKind, customerId: string | null, payload: Record<string, unknown>, validate: () => string | null, file?: File | null) {
    const err = validate();
    if (err) { toast.error(err); return; }
    setBusy(true);
    try {
      const res = await requestCustomerChange({ kind, customerId, payload });
      if (!res.ok || !res.data) { toast.error(res.error ?? '—'); return; }
      await uploadFile(res.data.requestId, file ?? null, 'supporting');
      toast.success(t('vanSales.requests.submitted')); resetAll(); router.refresh();
    } finally { setBusy(false); }
  }

  // New customer: create the request, then upload the evidence (storefront required).
  async function submitNew() {
    if (!nc.name.trim()) { toast.error(t('vanSales.requests.f_name')); return; }
    if (!nc.mobile.trim()) { toast.error(t('vanSales.requests.f_mobile')); return; }
    if (!nc.owner.trim()) { toast.error(t('vanSales.requests.f_owner')); return; }
    if (!nc.activity) { toast.error(t('vanSales.requests.f_activity')); return; }
    if (!nc.city.trim()) { toast.error(t('vanSales.requests.f_city')); return; }
    if (!nc.district.trim()) { toast.error(t('vanSales.requests.f_district')); return; }
    if (!ncGps) { toast.error(t('vanSales.requests.gpsRequired')); return; }
    if (!files.storefront) { toast.error(t('vanSales.requests.storefrontRequired')); return; }
    setBusy(true);
    try {
      const res = await requestCustomerChange({ kind: 'new_customer', customerId: null, payload: {
        ...nc, latitude: ncGps.lat, longitude: ncGps.lng,
      } });
      if (!res.ok || !res.data) { toast.error(res.error ?? '—'); return; }
      const reqId = res.data.requestId;
      const up = async (file: File | null, docType: string) => {
        if (!file) return true;
        const fd = new FormData();
        fd.set('entity', 'customer_request'); fd.set('record_id', reqId); fd.set('doc_type', docType); fd.set('file', file);
        const r = await uploadAttachment(fd);
        return r.ok;
      };
      const okStore = await up(files.storefront, 'storefront');
      if (!okStore) { toast.error(t('vanSales.requests.uploadFailed')); return; }
      await Promise.all([up(files.cr, 'cr'), up(files.vat, 'vat'), up(files.na, 'national_address'), up(files.other, 'other')]);
      toast.success(t('vanSales.requests.submitted')); resetAll(); router.refresh();
    } finally { setBusy(false); }
  }

  const tile = (key: Exclude<Open, null>, icon: ReactNode, title: string, desc: string) => (
    <Card>
      <CardContent className="py-4">
        <button type="button" className="flex w-full items-center gap-3 text-start" onClick={() => setOpen(open === key ? null : key)}>
          {icon}
          <div className="flex-1"><div className="text-sm font-medium">{title}</div><div className="text-xs text-muted-foreground">{desc}</div></div>
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${open === key ? 'rotate-90' : 'rtl:rotate-180'}`} />
        </button>
        {open === key && <div className="mt-3 space-y-3 border-t pt-3">{form(key)}</div>}
      </CardContent>
    </Card>
  );

  const custSelect = (value: string, onChange: (v: string) => void) => (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t('vanSales.requests.pickCustomer')}</option>
      {customers.map((c) => <option key={c.id} value={c.id}>{cName(c)} · {c.code}</option>)}
    </Select>
  );

  function form(key: Exclude<Open, null>) {
    if (key === 'new') return (
      <>
        <Section title={t('vanSales.requests.secCustomer')}>
          <Field label={t('vanSales.requests.f_name') + ' *'}><Input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} /></Field>
          <Field label={t('vanSales.requests.f_owner') + ' *'}><Input value={nc.owner} onChange={(e) => setNc({ ...nc, owner: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('vanSales.requests.f_mobile') + ' *'}><Input inputMode="tel" value={nc.mobile} onChange={(e) => setNc({ ...nc, mobile: e.target.value })} /></Field>
            <Field label={t('vanSales.requests.f_mobile2')}><Input inputMode="tel" value={nc.mobile2} onChange={(e) => setNc({ ...nc, mobile2: e.target.value })} /></Field>
          </div>
          <Field label={t('vanSales.requests.f_activity') + ' *'}>
            <Select value={nc.activity} onChange={(e) => setNc({ ...nc, activity: e.target.value })}>
              <option value="">—</option>
              {ACTIVITIES.map((a) => <option key={a} value={a}>{t(`vanSales.requests.act.${a}`)}</option>)}
            </Select>
          </Field>
        </Section>

        <Section title={t('vanSales.requests.secLocation')}>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('vanSales.requests.f_city') + ' *'}><Input value={nc.city} onChange={(e) => setNc({ ...nc, city: e.target.value })} /></Field>
            <Field label={t('vanSales.requests.f_district') + ' *'}><Input value={nc.district} onChange={(e) => setNc({ ...nc, district: e.target.value })} /></Field>
          </div>
          <Field label={t('vanSales.requests.f_gps') + ' *'}><GpsRow value={ncGps} onCapture={() => captureGps(setNcGps)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('vanSales.requests.f_naShort')}><Input value={nc.na_short} onChange={(e) => setNc({ ...nc, na_short: e.target.value })} /></Field>
            <Field label={t('vanSales.requests.f_postal')}><Input value={nc.postal_code} onChange={(e) => setNc({ ...nc, postal_code: e.target.value })} /></Field>
            <Field label={t('vanSales.requests.f_building')}><Input value={nc.building_no} onChange={(e) => setNc({ ...nc, building_no: e.target.value })} /></Field>
            <Field label={t('vanSales.requests.f_additional')}><Input value={nc.additional_no} onChange={(e) => setNc({ ...nc, additional_no: e.target.value })} /></Field>
          </div>
          <Field label={t('vanSales.requests.f_naFull')}><Input value={nc.na_full} onChange={(e) => setNc({ ...nc, na_full: e.target.value })} /></Field>
          <FileField label={t('vanSales.requests.f_storefront') + ' *'} file={files.storefront} onPick={(f) => setF('storefront', f)} />
        </Section>

        <Section title={t('vanSales.requests.secBusiness')}>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('vanSales.requests.f_cr')}><Input value={nc.cr} onChange={(e) => setNc({ ...nc, cr: e.target.value })} /></Field>
            <Field label={t('vanSales.requests.f_vat')}><Input value={nc.vat} onChange={(e) => setNc({ ...nc, vat: e.target.value })} /></Field>
            <Field label={t('vanSales.requests.f_existingCode')}><Input value={nc.existing_code} onChange={(e) => setNc({ ...nc, existing_code: e.target.value })} /></Field>
            <Field label={t('vanSales.requests.f_competitor')}><Input value={nc.competitor} onChange={(e) => setNc({ ...nc, competitor: e.target.value })} /></Field>
            <Field label={t('vanSales.requests.f_expectedSales')}><Input inputMode="decimal" value={nc.expected_monthly_sales} onChange={(e) => setNc({ ...nc, expected_monthly_sales: e.target.value })} /></Field>
            <Field label={t('vanSales.requests.f_classification')}>
              <Select value={nc.classification} onChange={(e) => setNc({ ...nc, classification: e.target.value })}>
                <option value="">—</option>{CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
          </div>
        </Section>

        <Section title={t('vanSales.requests.secCredit')}>
          <Field label={t('vanSales.requests.f_paymentType')}>
            <Select value={nc.payment_type} onChange={(e) => setNc({ ...nc, payment_type: e.target.value })}>
              <option value="">—</option>
              <option value="cash">{t('vanSales.requests.pt_cash')}</option>
              <option value="credit">{t('vanSales.requests.pt_credit')}</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('vanSales.requests.f_reqLimit')}><Input inputMode="decimal" value={nc.requested_credit_limit} onChange={(e) => setNc({ ...nc, requested_credit_limit: e.target.value })} /></Field>
            <Field label={t('vanSales.requests.f_reqTerms')}><Input inputMode="numeric" value={nc.requested_terms} onChange={(e) => setNc({ ...nc, requested_terms: e.target.value })} /></Field>
          </div>
        </Section>

        <Section title={t('vanSales.requests.secAssign')}>
          <Field label={t('vanSales.requests.f_route')}>
            <Select value={nc.route_id} onChange={(e) => setNc({ ...nc, route_id: e.target.value })}>
              <option value="">{t('vanSales.requests.routeUnassigned')}</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}{r.code ? ` · ${r.code}` : ''}</option>)}
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">{t('vanSales.requests.assignNote')}</p>
        </Section>

        <Section title={t('vanSales.requests.secDocs')}>
          <FileField label={t('vanSales.requests.f_crDoc')} file={files.cr} onPick={(f) => setF('cr', f)} />
          <FileField label={t('vanSales.requests.f_vatDoc')} file={files.vat} onPick={(f) => setF('vat', f)} />
          <FileField label={t('vanSales.requests.f_naDoc')} file={files.na} onPick={(f) => setF('na', f)} />
          <FileField label={t('vanSales.requests.f_otherDoc')} file={files.other} onPick={(f) => setF('other', f)} />
        </Section>

        <Field label={t('vanSales.requests.f_notes')}><Input value={nc.notes} onChange={(e) => setNc({ ...nc, notes: e.target.value })} /></Field>
        <SubmitBtn busy={busy} onClick={submitNew} />
      </>
    );

    if (key === 'update') return (
      <>
        <Field label={t('vanSales.requests.pickCustomer')}>{custSelect(upCust, setUpCust)}</Field>
        <Field label={t('vanSales.requests.field')}>
          <Select value={upField} onChange={(e) => setUpField(e.target.value as UpdateField)}>
            {UPDATE_FIELDS.map((f) => <option key={f} value={f}>{t(`vanSales.requests.fld.${f}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('vanSales.requests.currentValue')}><Input value={currentValue} readOnly disabled /></Field>
        <Field label={t('vanSales.requests.newValue')}><Input value={upNew} onChange={(e) => setUpNew(e.target.value)} /></Field>
        <Field label={t('vanSales.requests.reason')}><Input value={upReason} onChange={(e) => setUpReason(e.target.value)} /></Field>
        <SubmitBtn busy={busy} onClick={() => submit('data_update', upCust, { field: upField, current_value: currentValue, new_value: upNew, reason: upReason },
          () => (!upCust ? t('vanSales.requests.customerRequired') : !upNew.trim() ? t('vanSales.requests.newValueRequired') : !upReason.trim() ? t('vanSales.requests.reasonRequired') : null))} />
      </>
    );

    if (key === 'gps') return (
      <>
        <Field label={t('vanSales.requests.pickCustomer')}>{custSelect(gpsCust, (v) => { setGpsCust(v); setGpsNew(null); })}</Field>
        <div className="text-xs text-muted-foreground" dir="ltr">{t('vanSales.requests.currentLocation')}: {selectedGps?.latitude != null ? `${selectedGps.latitude}, ${selectedGps.longitude}` : '—'}</div>
        <GpsRow value={gpsNew} onCapture={() => captureGps(setGpsNew)} />
        {gpsDistance != null && <div className="text-xs font-medium" dir="ltr">{t('vanSales.requests.distance')}: {gpsDistance} m</div>}
        <Field label={t('vanSales.requests.reason')}><Input value={gpsReason} onChange={(e) => setGpsReason(e.target.value)} /></Field>
        <SubmitBtn busy={busy} onClick={() => submit('gps_correction', gpsCust, { current_lat: selectedGps?.latitude ?? '', current_lng: selectedGps?.longitude ?? '', new_lat: gpsNew?.lat ?? '', new_lng: gpsNew?.lng ?? '', distance_m: gpsDistance ?? '', reason: gpsReason },
          () => (!gpsCust ? t('vanSales.requests.customerRequired') : !gpsNew ? t('vanSales.requests.gpsRequired') : !gpsReason.trim() ? t('vanSales.requests.reasonRequired') : null))} />
      </>
    );

    if (key === 'credit') return (
      <>
        <Field label={t('vanSales.requests.pickCustomer')}>{custSelect(clCust, setClCust)}</Field>
        <Field label={t('vanSales.requests.currentValue')}><Input value={customers.find((c) => c.id === clCust)?.credit_limit?.toString() ?? ''} readOnly disabled /></Field>
        <Field label={t('vanSales.requests.f_reqLimit')}><Input inputMode="decimal" value={clLimit} onChange={(e) => setClLimit(e.target.value)} /></Field>
        <Field label={t('vanSales.requests.reason')}><Input value={clReason} onChange={(e) => setClReason(e.target.value)} /></Field>
        <FileField label={t('vanSales.requests.f_support')} file={clFile} onPick={setClFile} />
        <SubmitBtn busy={busy} onClick={() => submit('credit_limit', clCust, { new_limit: clLimit, reason: clReason },
          () => (!clCust ? t('vanSales.requests.customerRequired') : !(Number(clLimit) >= 0 && clLimit !== '') ? t('vanSales.requests.amountRequired') : null), clFile)} />
      </>
    );

    if (key === 'terms') return (
      <>
        <Field label={t('vanSales.requests.pickCustomer')}>{custSelect(ptCust, setPtCust)}</Field>
        <Field label={t('vanSales.requests.currentValue')}><Input value={customers.find((c) => c.id === ptCust)?.payment_terms_days?.toString() ?? ''} readOnly disabled /></Field>
        <Field label={t('vanSales.requests.f_reqTerms')}><Input inputMode="numeric" value={ptTerms} onChange={(e) => setPtTerms(e.target.value)} /></Field>
        <Field label={t('vanSales.requests.reason')}><Input value={ptReason} onChange={(e) => setPtReason(e.target.value)} /></Field>
        <FileField label={t('vanSales.requests.f_support')} file={ptFile} onPick={setPtFile} />
        <SubmitBtn busy={busy} onClick={() => submit('payment_terms', ptCust, { new_terms: ptTerms, reason: ptReason },
          () => (!ptCust ? t('vanSales.requests.customerRequired') : ptTerms === '' ? t('vanSales.requests.termsRequired') : null), ptFile)} />
      </>
    );

    if (key === 'route') {
      const c = customers.find((x) => x.id === rtCust) ?? null;
      return (
        <>
          <Field label={t('vanSales.requests.pickCustomer')}>{custSelect(rtCust, setRtCust)}</Field>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div>{t('vanSales.requests.f_currentRoute')}: <span className="font-medium text-foreground">{routeName(c?.route_id)}</span></div>
            <div>{t('vanSales.requests.f_currentSalesman')}: <span className="font-medium text-foreground">{repName(c?.salesman_id)}</span></div>
          </div>
          <Field label={t('vanSales.requests.f_reqRoute')}>
            <Select value={rtRoute} onChange={(e) => setRtRoute(e.target.value)}>
              <option value="">—</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.name}{r.code ? ` · ${r.code}` : ''}</option>)}
            </Select>
          </Field>
          {rtRoute && <div className="text-xs text-muted-foreground">{t('vanSales.requests.f_reqSalesman')}: <span className="font-medium text-foreground">{repName(reqRouteRep)}</span></div>}
          <Field label={t('vanSales.requests.reason')}><Input value={rtReason} onChange={(e) => setRtReason(e.target.value)} /></Field>
          <SubmitBtn busy={busy} onClick={() => submit('route_transfer', rtCust, {
            req_route: rtRoute, req_salesman: reqRouteRep ?? '',
            route_from: routeName(c?.route_id), route_to: routeName(rtRoute),
            salesman_from: repName(c?.salesman_id), salesman_to: repName(reqRouteRep), reason: rtReason,
          }, () => (!rtCust ? t('vanSales.requests.customerRequired') : !rtRoute ? t('vanSales.requests.routeRequired') : !rtReason.trim() ? t('vanSales.requests.reasonRequired') : null))} />
        </>
      );
    }

    if (key === 'reactivate') {
      const c = customers.find((x) => x.id === raCust) ?? null;
      return (
        <>
          <Field label={t('vanSales.requests.pickCustomer')}>{custSelect(raCust, setRaCust)}</Field>
          <div className="text-xs text-muted-foreground">{t('vanSales.requests.f_lastPurchase')}: <span className="font-medium text-foreground">{c?.last_purchase ?? '—'}</span></div>
          <Field label={t('vanSales.requests.f_reactivateReason')}><Input value={raReason} onChange={(e) => setRaReason(e.target.value)} /></Field>
          <Field label={t('vanSales.requests.f_notes')}><Input value={raNotes} onChange={(e) => setRaNotes(e.target.value)} /></Field>
          <SubmitBtn busy={busy} onClick={() => submit('reactivate', raCust, { last_purchase: c?.last_purchase ?? '', reason: raReason, notes: raNotes },
            () => (!raCust ? t('vanSales.requests.customerRequired') : !raReason.trim() ? t('vanSales.requests.reasonRequired') : null))} />
        </>
      );
    }

    if (key === 'close') return (
      <>
        <Field label={t('vanSales.requests.pickCustomer')}>{custSelect(clxCust, setClxCust)}</Field>
        <Field label={t('vanSales.requests.f_closureReason')}>
          <Select value={clxReason} onChange={(e) => setClxReason(e.target.value)}>
            <option value="">—</option>{CLOSURE_REASONS.map((r) => <option key={r} value={r}>{t(`vanSales.requests.cr.${r}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('vanSales.requests.f_notes')}><Input value={clxNotes} onChange={(e) => setClxNotes(e.target.value)} /></Field>
        <FileField label={t('vanSales.requests.f_support')} file={clxFile} onPick={setClxFile} />
        <SubmitBtn busy={busy} onClick={() => submit('close', clxCust, { closure_reason: clxReason, notes: clxNotes },
          () => (!clxCust ? t('vanSales.requests.customerRequired') : !clxReason ? t('vanSales.requests.closureRequired') : null), clxFile)} />
      </>
    );
    return null;
  }

  return (
    <div className="space-y-3">
      {tile('new', <UserPlus className="h-5 w-5 text-primary" />, t('vanSales.requests.newCustomer'), t('vanSales.requests.newCustomerDesc'))}
      {tile('update', <FileEdit className="h-5 w-5 text-primary" />, t('vanSales.requests.updateData'), t('vanSales.requests.updateDataDesc'))}
      {tile('gps', <MapPin className="h-5 w-5 text-primary" />, t('vanSales.requests.fixLocation'), t('vanSales.requests.fixLocationDesc'))}
      {tile('credit', <CreditCard className="h-5 w-5 text-primary" />, t('vanSales.requests.creditChange'), t('vanSales.requests.creditChangeDesc'))}
      {tile('terms', <CalendarClock className="h-5 w-5 text-primary" />, t('vanSales.requests.termsChange'), t('vanSales.requests.termsChangeDesc'))}
      {tile('route', <Shuffle className="h-5 w-5 text-primary" />, t('vanSales.requests.routeTransfer'), t('vanSales.requests.routeTransferDesc'))}
      {tile('reactivate', <RotateCcw className="h-5 w-5 text-primary" />, t('vanSales.requests.reactivate'), t('vanSales.requests.reactivateDesc'))}
      {tile('close', <Ban className="h-5 w-5 text-primary" />, t('vanSales.requests.closeCustomer'), t('vanSales.requests.closeCustomerDesc'))}
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

  function SubmitBtn({ busy: b, onClick }: { busy: boolean; onClick: () => void }) {
    return <Button className="w-full" loading={b} onClick={onClick}>{b ? t('vanSales.requests.submitting') : <><Send className="h-4 w-4" /> {t('vanSales.requests.submit')}</>}</Button>;
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}
function FileField({ label, file, onPick }: { label: string; file: File | null; onPick: (f: File | null) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <input type="file" accept="image/*,.pdf" capture="environment"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        className="block w-full text-xs file:mr-3 file:rounded-md file:border file:border-input file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium" />
      {file && <span className="text-xs text-muted-foreground">{file.name}</span>}
    </div>
  );
}
