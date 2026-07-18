import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { KPICard } from '@/components/shared/KPICard';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';
import {
  initDataLayer,
  subscribeDataLayer,
  getDataLayerVersion,
  uploadCommercialFile,
  getImportHistory,
  listBatches,
  removeBatch,
  getStorageMode,
  getCustomers,
  getProducts,
  getSalesTransactions,
  isBatchImportedForDistributor,
  markTradeSpendImport,
  type UploadJob,
} from '@/lib/data-layer';

function fmtN(n: number): string {
  return n.toLocaleString('en-US');
}

function JobResult({ job }: { job: UploadJob }) {
  const { t } = useTranslation();
  if (job.status === 'failed') {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[12px]">
        <p className="flex items-center gap-1.5 font-semibold text-destructive">
          <AlertTriangle className="h-4 w-4" /> {t('cdl.uploadFailed')}
        </p>
        <p className="mt-1 text-foreground">{job.error}</p>
        {job.headersFound.length > 0 && (
          <p className="mt-1 text-muted-foreground">
            {t('cdl.headersFound')}: {job.headersFound.join(' · ')}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-[12px]">
      <p className="flex items-center gap-1.5 font-semibold text-success">
        <CheckCircle2 className="h-4 w-4" /> {t('cdl.uploadStored', { name: job.fileName })}
      </p>
      {job.summary && (
        <p className="mt-1 text-foreground">
          {t('cdl.uploadSummary', {
            rows: fmtN(job.summary.nRows),
            invoices: fmtN(job.summary.nInvoices),
            customers: fmtN(job.summary.customers),
            products: fmtN(job.summary.products),
            from: job.summary.from,
            to: job.summary.to,
          })}
        </p>
      )}
      {job.renamed.length > 0 && (
        <p className="mt-1 text-muted-foreground">
          {t('cdl.renamedHeaders')}:{' '}
          {job.renamed.map((r) => `"${r.from}" → ${r.to}`).join(' · ')}
        </p>
      )}
    </div>
  );
}

export function CommercialDataPage() {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastJob, setLastJob] = useState<UploadJob | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const version = useSyncExternalStore(subscribeDataLayer, getDataLayerVersion);

  const currentDistributorId = useTradeSpendStore((s) => s.currentDistributorId);
  const distributors = useTradeSpendStore((s) => s.distributors);
  const importRawData = useTradeSpendStore((s) => s.importRawData);
  const currentUser = useTradeSpendStore((s) => s.currentUser);
  const isAdminish = (currentUser?.roles || []).some((r) => r === 'admin' || r === 'roshen_approver');

  useEffect(() => {
    let alive = true;
    initDataLayer().then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  const data = useMemo(() => {
    if (!ready) return null;
    return {
      batches: listBatches(),
      history: getImportHistory().slice(0, 12),
      mode: getStorageMode(),
      customers: getCustomers(),
      products: getProducts(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, version]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const job = await uploadCommercialFile(file);
        setLastJob(job);
        if (job.status === 'stored') toast.success(t('cdl.toastStored', { name: file.name }));
        else toast.error(t('cdl.toastFailed', { name: file.name }));
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [t]);

  const handleUseInTradeSpend = useCallback((batchId: string) => {
    if (!currentDistributorId) return;
    const txns = getSalesTransactions({ batchId });
    if (!txns.length) {
      toast.warning(t('cdl.noTransactions'));
      return;
    }
    // Feed Trade Spend through its own untouched pipeline: rows + a fixed
    // mapping, exactly like its manual upload path.
    const rows = txns.map((tx) => ({
      account: tx.account,
      item: tx.item_id,
      date: tx.date,
      value: tx.value_ex_vat,
      cases: tx.cases,
    }));
    const mapping = {
      customer_account: 'account',
      item_id: 'item',
      invoice_date: 'date',
      invoice_amount: 'value',
      invoice_qty_cases: 'cases',
    };
    importRawData(rows as unknown as Record<string, unknown>[], mapping as never);
    markTradeSpendImport(batchId, currentDistributorId, txns.length);
    toast.success(t('cdl.toastTradeSpend', { n: fmtN(txns.length) }));
  }, [currentDistributorId, importRawData, t]);

  if (!data) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  const distName = distributors.find((d) => d.id === currentDistributorId)?.name || '';

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-h2 text-foreground">{t('cdl.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('cdl.subtitle')}</p>
      </div>

      {data.mode === 'memory' && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-[12px] text-foreground">
          <AlertTriangle className="me-1.5 inline h-4 w-4 text-warning" />
          {t('cdl.memoryWarning')}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard label={t('cdl.kpiBatches')} value={fmtN(data.batches.length)} icon={Database}
          hint={t(`promotions.poolMode.${data.mode}`)} tone={data.mode === 'memory' ? 'warning' : 'default'} />
        <KPICard label={t('cdl.kpiInvoices')} value={fmtN(data.batches.reduce((s, b) => s + b.nInv, 0))} icon={FileSpreadsheet} />
        <KPICard label={t('cdl.kpiCustomers')} value={fmtN(data.customers.length)} icon={Users}
          hint={t('cdl.kpiMasterPlusPool')} />
        <KPICard label={t('cdl.kpiProducts')} value={fmtN(data.products.length)} icon={Database}
          hint={t('cdl.kpiMasterPlusPool')} />
      </div>

      {/* Upload */}
      <Card className="p-4">
        <h2 className="text-h3 text-foreground">{t('cdl.uploadTitle')}</h2>
        <p className="mt-1 text-[12px] text-muted-foreground">{t('cdl.uploadHint')}</p>
        <div
          className="mt-3 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/20 px-4 py-8"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void handleFiles(e.dataTransfer.files);
          }}
        >
          <Upload className="h-7 w-7 text-muted-foreground" />
          <p className="text-[13px] text-muted-foreground">{t('cdl.dropHere')}</p>
          <Button disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? t('cdl.processing') : t('cdl.chooseFile')}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            multiple
            className="hidden"
            data-testid="cdl-file-input"
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </div>
        {lastJob && (
          <div className="mt-3">
            <JobResult job={lastJob} />
          </div>
        )}
      </Card>

      {/* Stored batches */}
      <section>
        <h2 className="mb-3 text-h3 text-foreground">{t('cdl.batchesTitle')}</h2>
        {data.batches.length === 0 ? (
          <EmptyState icon={Database} title={t('cdl.emptyBatches')} description={t('cdl.emptyBatchesHint')} />
        ) : (
          <Card className="divide-y divide-border">
            {data.batches.map((b) => {
              const alreadyImported = currentDistributorId
                ? isBatchImportedForDistributor(b.id, currentDistributorId)
                : false;
              return (
                <div key={b.id} className="flex flex-wrap items-center gap-3 p-3">
                  <FileSpreadsheet className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-foreground">{b.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {b.from} → {b.to} · {fmtN(b.nInv)} {t('promotions.invoices')} · {fmtN(b.nRows)} {t('cdl.rows')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isAdminish && currentDistributorId && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={alreadyImported}
                        onClick={() => handleUseInTradeSpend(b.id)}
                        title={alreadyImported ? t('cdl.alreadyImported', { dist: distName }) : undefined}
                      >
                        {alreadyImported
                          ? t('cdl.importedBadge', { dist: distName })
                          : t('cdl.useInTradeSpend', { dist: distName })}
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" aria-label={t('common.delete')} onClick={() => setConfirmRemove(b.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">{t('cdl.promotionsNote')}</p>
      </section>

      {/* Import history */}
      <section>
        <h2 className="mb-3 text-h3 text-foreground">{t('cdl.historyTitle')}</h2>
        {data.history.length === 0 ? (
          <EmptyState icon={FileSpreadsheet} title={t('cdl.emptyHistory')} />
        ) : (
          <Card className="divide-y divide-border">
            {data.history.map((j) => (
              <div key={j.id} className="flex items-center gap-3 p-3 text-[12px]">
                {j.status === 'stored' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{j.fileName}</p>
                  {j.error && <p className="truncate text-muted-foreground">{j.error}</p>}
                </div>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {new Date(j.at).toLocaleString()}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>

      <ConfirmDialog
        open={confirmRemove != null}
        onOpenChange={(open) => {
          if (!open) setConfirmRemove(null);
        }}
        title={t('cdl.removeTitle')}
        description={t('cdl.removeDesc')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={async () => {
          if (confirmRemove) await removeBatch(confirmRemove);
        }}
      />
    </div>
  );
}

export default CommercialDataPage;
