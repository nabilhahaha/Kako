'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2, Hash, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { useI18n } from '@/lib/i18n/provider';
import { previewNumber, sanitizePrefix, isNextNumberAllowed } from '@/lib/onboarding/numbering';
import {
  loadNumbering, saveNumbering, type NumberingBranch, type NumberingRow,
} from '@/lib/onboarding/numbering-server';

export function NumberingManager({
  branches,
  initialBranchId,
  initialBranchCode,
  initialRows,
}: {
  branches: NumberingBranch[];
  initialBranchId: string | null;
  initialBranchCode: string | null;
  initialRows: NumberingRow[];
}) {
  const { t, locale } = useI18n();
  const ar = locale === 'ar';
  const [pending, startTransition] = useTransition();
  const [branchId, setBranchId] = useState(initialBranchId);
  const [branchCode, setBranchCode] = useState(initialBranchCode ?? '');
  const [rows, setRows] = useState<NumberingRow[]>(initialRows);

  // Switch branch → reload that branch's rows.
  useEffect(() => {
    if (!branchId || branchId === initialBranchId) return;
    startTransition(async () => {
      const res = await loadNumbering(branchId);
      if (res.ok && res.data) {
        setRows(res.data.rows);
        setBranchCode(res.data.branchCode ?? '');
      } else {
        toast.error(t('numbering.err.generic'));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  if (branches.length === 0) {
    return (
      <EmptyState
        icon={<Hash />}
        title={t('numbering.noBranchesTitle')}
        description={t('numbering.noBranchesDescription')}
      />
    );
  }

  return (
    <div className="space-y-4">
      {branches.length > 1 && (
        <div className="max-w-sm space-y-1.5">
          <Label htmlFor="numbering-branch">{t('numbering.branch')}</Label>
          <Select id="numbering-branch" value={branchId ?? ''} onChange={(e) => setBranchId(e.target.value)} disabled={pending}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{(ar && b.nameAr) || b.name} ({b.code})</option>
            ))}
          </Select>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <NumberingCard
            key={row.seqType}
            row={row}
            branchCode={branchCode}
            disabled={pending || !branchId}
            onSaved={(updated) => setRows((prev) => prev.map((r) => (r.seqType === updated.seqType ? updated : r)))}
            branchId={branchId!}
          />
        ))}
      </div>
    </div>
  );
}

function NumberingCard({
  row,
  branchCode,
  branchId,
  disabled,
  onSaved,
}: {
  row: NumberingRow;
  branchCode: string;
  branchId: string;
  disabled: boolean;
  onSaved: (r: NumberingRow) => void;
}) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [prefix, setPrefix] = useState(row.prefix);
  const [nextNumber, setNextNumber] = useState<number>(row.nextNumber);

  // Reset local edits when the underlying row changes (e.g. branch switch).
  useEffect(() => { setPrefix(row.prefix); setNextNumber(row.nextNumber); }, [row]);

  const cleanPrefix = sanitizePrefix(prefix) || row.prefix;
  const preview = useMemo(
    () => previewNumber(cleanPrefix, branchCode, nextNumber || 1),
    [cleanPrefix, branchCode, nextNumber],
  );

  // Floor for the next number: the value already shown is the minimum (you can
  // keep or skip ahead, never reuse an issued number).
  const floor = row.nextNumber;
  const tooLow = !isNextNumberAllowed(nextNumber, floor - 1);
  const dirty = cleanPrefix !== row.prefix || nextNumber !== row.nextNumber;

  function onSave() {
    if (tooLow) { toast.error(t('numbering.err.number_too_low')); return; }
    startTransition(async () => {
      const res = await saveNumbering({ branchId, seqType: row.seqType, prefix: cleanPrefix, nextNumber });
      if (!res.ok) { toast.error(t(`numbering.err.${res.error ?? 'generic'}`)); return; }
      toast.success(t('numbering.toast.saved'));
      onSaved({ ...row, prefix: cleanPrefix, nextNumber, started: true, preview: res.data?.preview ?? preview });
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{t(`numbering.docType.${row.seqType}`)}</h3>
          {!row.started && <Badge variant="outline">{t('numbering.notStarted')}</Badge>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`pfx-${row.seqType}`}>{t('numbering.prefix')}</Label>
            <Input
              id={`pfx-${row.seqType}`}
              value={prefix}
              dir="ltr"
              onChange={(e) => setPrefix(e.target.value)}
              disabled={disabled || pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`next-${row.seqType}`}>{t('numbering.nextNumber')}</Label>
            <Input
              id={`next-${row.seqType}`}
              type="number"
              min={floor}
              value={Number.isFinite(nextNumber) ? nextNumber : ''}
              dir="ltr"
              onChange={(e) => setNextNumber(parseInt(e.target.value, 10))}
              disabled={disabled || pending}
              aria-invalid={tooLow}
              className={tooLow ? 'border-destructive' : undefined}
            />
          </div>
        </div>

        {tooLow && (
          <p className="text-xs text-destructive">{t('numbering.minHint', { n: floor })}</p>
        )}

        <div className="rounded-md bg-secondary/60 px-3 py-2">
          <p className="text-xs text-muted-foreground">{t('numbering.preview')}</p>
          <p className="font-mono text-sm" dir="ltr">{preview}</p>
        </div>

        <Button size="sm" onClick={onSave} disabled={disabled || pending || tooLow || !dirty} className="w-full">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t('numbering.save')}
        </Button>
      </CardContent>
    </Card>
  );
}
