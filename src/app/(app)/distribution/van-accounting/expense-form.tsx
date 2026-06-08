'use client';

import { useRef, useState, useTransition } from 'react';
import { useI18n } from '@/lib/i18n/provider';
import { addVanExpense } from './actions';

// Client form for adding a van/route expense — calls the server action, surfaces
// validation errors inline, and resets on success (the action revalidates the page).
export function ExpenseForm({ categories }: { categories: { id: string; label: string }[] }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      action={(fd) => start(async () => {
        const res = await addVanExpense(fd);
        if (!res.ok) setError(res.error ?? t('distribution.errorGeneric'));
        else { setError(null); ref.current?.reset(); }
      })}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">{t('distribution.vanAccCategory')}</label>
        <select name="category_id" className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="">—</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">{t('distribution.vanAccAmount')}</label>
        <input name="amount" type="number" step="0.01" min="0" required className="h-9 w-32 rounded-md border bg-background px-2 text-sm" />
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <label className="text-xs text-muted-foreground">{t('distribution.vanAccNotes')}</label>
        <input name="notes" type="text" className="h-9 rounded-md border bg-background px-2 text-sm" />
      </div>
      <button type="submit" disabled={pending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
        {t('distribution.vanAccAddExpense')}
      </button>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </form>
  );
}
