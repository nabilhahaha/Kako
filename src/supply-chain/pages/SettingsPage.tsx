/** Settings — configurable business rules, operator identity, rule catalog. */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfig } from '../hooks/queries';
import { useResetData, useUpdateConfig } from '../hooks/mutations';
import { describeRules } from '../validation/engine';
import { getCurrentOperator, setCurrentOperator } from '../services/session';
import { Field, PageHeader } from '../components/primitives';

export function SettingsPage() {
  const { data: config, isLoading } = useConfig();
  const updateConfig = useUpdateConfig();
  const resetData = useResetData();

  const [minShelfLifePct, setMin] = useState('70');
  const [maxQtyDiff, setMaxQty] = useState('0');
  const [invoiceTol, setInvoiceTol] = useState('0');
  const [operator, setOperator] = useState(getCurrentOperator());

  useEffect(() => {
    if (config) {
      setMin(String(config.minShelfLifePct));
      setMaxQty(String(config.maxQuantityDifference));
      setInvoiceTol(String(config.invoiceQuantityTolerance));
    }
  }, [config]);

  const rules = describeRules();

  const save = async () => {
    try {
      setCurrentOperator(operator.trim() || 'operator@roshen');
      await updateConfig.mutateAsync({
        minShelfLifePct: Number(minShelfLifePct) || 0,
        maxQuantityDifference: Number(maxQtyDiff) || 0,
        invoiceQuantityTolerance: Number(invoiceTol) || 0,
      });
      toast.success('Settings saved. Re-validate a PI to apply new thresholds.');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const reset = async () => {
    if (!window.confirm('This permanently deletes ALL PIs, delivery notes, invoices, exceptions and audit logs. Continue?')) {
      return;
    }
    await resetData.mutateAsync();
    toast.success('All operational data has been reset.');
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Configure validation thresholds and operator identity." />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <Card>
            <CardHeader className="p-5 pb-0">
              <CardTitle className="text-base">Validation configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Minimum shelf life (%)" hint="RULE 4 — remaining shelf life threshold.">
                  <Input type="number" value={minShelfLifePct} onChange={(e) => setMin(e.target.value)} min={0} max={100} />
                </Field>
                <Field label="Max quantity difference" hint="RULE 2 — allowed over-delivery in units.">
                  <Input type="number" value={maxQtyDiff} onChange={(e) => setMaxQty(e.target.value)} min={0} />
                </Field>
                <Field label="Invoice quantity tolerance" hint="Allowed delivered vs invoiced gap in units.">
                  <Input type="number" value={invoiceTol} onChange={(e) => setInvoiceTol(e.target.value)} min={0} />
                </Field>
              </div>
              <Field label="Operator" hint="Attributed to all actions in the audit log.">
                <Input value={operator} onChange={(e) => setOperator(e.target.value)} className="sm:max-w-xs" />
              </Field>
              <div>
                <Button onClick={save} disabled={updateConfig.isPending}>
                  <Save className="h-4 w-4" /> {updateConfig.isPending ? 'Saving…' : 'Save settings'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-5 pb-0">
              <CardTitle className="text-base">Validation rules</CardTitle>
              <p className="text-sm text-muted-foreground">
                Rules run automatically after every change. Add new rules without touching existing ones.
              </p>
            </CardHeader>
            <CardContent className="space-y-2 p-5">
              {rules.map((r) => (
                <div key={r.code} className="flex items-start justify-between gap-4 rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.description}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <code className="text-[11px] text-muted-foreground">{r.code}</code>
                    {r.requiresExceptionOnFail && (
                      <span className="rounded bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-orange-600 dark:text-orange-400">
                        Exception on fail
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-destructive/30">
            <CardHeader className="p-5 pb-0">
              <CardTitle className="flex items-center gap-2 text-base text-destructive">
                <AlertTriangle className="h-4 w-4" /> Danger zone
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="text-sm text-muted-foreground">
                Permanently delete all operational data. This cannot be undone.
              </p>
              <Button variant="destructive" onClick={reset} disabled={resetData.isPending}>
                {resetData.isPending ? 'Resetting…' : 'Reset all data'}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
