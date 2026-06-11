'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n/provider';
import { Plus } from 'lucide-react';
import { quickCreateCustomer } from '@/app/(app)/contacts/actions';

export interface QuickContact { id: string; name: string; name_ar: string | null }

/**
 * Reusable inline lightweight-customer create — Platform Contact Model. Drop into
 * any POS/screen: a "+" toggles a name (+ optional phone) form, Enter-to-save,
 * mobile/tablet friendly. Calls the platform quickCreateCustomer action and
 * returns the created contact so the caller can auto-select it. Render only when
 * the tenant flags + role permission allow it (caller passes `enabled`).
 */
export function QuickCustomerCreate({
  enabled, onCreated,
}: {
  enabled: boolean;
  onCreated: (c: QuickContact) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  if (!enabled) return null;

  function save() {
    const nm = name.trim();
    if (!nm) { toast.error(t('contacts.nameRequired')); return; }
    setBusy(true);
    quickCreateCustomer({ name: nm, phone }).then((res) => {
      setBusy(false);
      if (!res.ok || !res.data) { toast.error(res.error ?? t('contacts.error')); return; }
      onCreated({ id: res.data.id, name: res.data.name, name_ar: null });
      setName(''); setPhone(''); setOpen(false);
      toast.success(t('contacts.created'));
    });
  }

  return (
    <>
      <Button type="button" variant="outline" className="h-10 px-3" onClick={() => setOpen((s) => !s)} title={t('contacts.new')}>
        <Plus className="h-4 w-4" />
      </Button>
      {open && (
        <div className="flex w-full flex-wrap items-center gap-2 rounded-md border border-dashed p-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('contacts.name')}
            className="h-10 flex-1" autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} />
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('contacts.phone')}
            className="h-10 w-32" dir="ltr"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} />
          <Button type="button" className="h-10" disabled={busy} onClick={save}>{t('contacts.save')}</Button>
        </div>
      )}
    </>
  );
}
