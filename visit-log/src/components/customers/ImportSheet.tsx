import { useRef, useState } from 'react'
import { FileSpreadsheet, FileUp } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/toast'
import { useImportCustomers } from '@/hooks/mutations'
import type { ImportPreview } from '@/lib/importCustomers'

export function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const importCustomers = useImportCustomers()

  const close = () => {
    setPreview(null)
    setFileName('')
    onClose()
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setParsing(true)
    try {
      // xlsx is heavy — loaded on demand only.
      const { parseCustomerFile } = await import('@/lib/importCustomers')
      const parsed = await parseCustomerFile(file)
      if (parsed.rows.length === 0) {
        toast('No customers found — check that the file has a Name column', 'error')
        return
      }
      setFileName(file.name)
      setPreview(parsed)
    } catch {
      toast('Could not read this file', 'error')
    } finally {
      setParsing(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const runImport = async () => {
    if (!preview) return
    try {
      const inserted = await importCustomers.mutateAsync(preview.rows)
      toast(`Imported ${inserted} customer${inserted === 1 ? '' : 's'}`)
      close()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Import failed', 'error')
    }
  }

  return (
    <Sheet open={open} onClose={close} title="Import from Excel">
      <input
        ref={fileInput}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(event) => onFile(event.target.files?.[0])}
      />
      {!preview ? (
        <div className="space-y-4 pt-2">
          <button
            onClick={() => fileInput.current?.click()}
            disabled={parsing}
            className="press flex w-full flex-col items-center rounded-card border-2 border-dashed border-separator bg-surface-2/50 px-6 py-10 text-center"
          >
            <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-accent-soft">
              <FileUp className="h-7 w-7 text-accent" strokeWidth={1.8} />
            </span>
            <span className="text-[16px] font-bold">
              {parsing ? 'Reading file…' : 'Choose Excel file'}
            </span>
            <span className="mt-1 text-[13px] text-ink-2">.xlsx, .xls or .csv</span>
          </button>
          <p className="px-1 text-[13px] leading-relaxed text-ink-2">
            Columns are matched automatically — Name, Code, City, Area, Address, Phone, Notes,
            Latitude and Longitude. Only the Name column is required.
          </p>
          <Button
            variant="ghost"
            full
            onClick={async () => (await import('@/lib/importCustomers')).downloadImportTemplate()}
          >
            <FileSpreadsheet size={17} />
            Download template
          </Button>
        </div>
      ) : (
        <div className="space-y-4 pt-2">
          <div className="rounded-card bg-surface-2/60 p-4">
            <p className="text-[15px] font-bold">{fileName}</p>
            <p className="mt-1 text-[13px] text-ink-2">
              {preview.rows.length} customer{preview.rows.length === 1 ? '' : 's'} ready to import
              {preview.skipped > 0 && ` · ${preview.skipped} row${preview.skipped === 1 ? '' : 's'} skipped (no name)`}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {preview.mappedColumns.map((column) => (
                <span
                  key={column}
                  className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent"
                >
                  {column}
                </span>
              ))}
            </div>
          </div>
          <div className="overflow-hidden rounded-card bg-surface-2/60">
            {preview.rows.slice(0, 5).map((row, index) => (
              <div
                key={index}
                className="border-b border-separator/60 px-4 py-2.5 last:border-b-0"
              >
                <p className="truncate text-[14px] font-semibold">{row.name}</p>
                <p className="truncate text-[12px] text-ink-2">
                  {[row.code, row.city, row.area, row.phone].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
            ))}
            {preview.rows.length > 5 && (
              <p className="px-4 py-2.5 text-[12px] font-medium text-ink-3">
                + {preview.rows.length - 5} more…
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" full onClick={() => setPreview(null)}>
              Choose another
            </Button>
            <Button full loading={importCustomers.isPending} onClick={runImport}>
              Import {preview.rows.length}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
