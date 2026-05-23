import { useState, useRef } from 'react';
import { parseExcelToDataset, type UploadProgress } from '@/lib/excelToSalesData';
import type { SalesDataset } from '@/lib/salesTypes';

interface Props {
  onDataLoaded: (data: SalesDataset) => void;
}

export function ExcelUpload({ onDataLoaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    setProgress({ stage: 'Starting...', percent: 0 });

    try {
      const dataset = await parseExcelToDataset(file, setProgress);
      onDataLoaded(dataset);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 shadow-sm"
      >
        {uploading ? (
          <>
            <span className="animate-spin">&#9696;</span>
            <span>{progress?.stage || 'Processing...'}</span>
          </>
        ) : (
          <>
            <span>📤</span>
            <span>Upload Excel</span>
          </>
        )}
      </button>

      {uploading && progress && (
        <div className="flex items-center gap-2 flex-1 max-w-xs">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {progress.percent}%
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
          <span className="text-red-500 text-sm font-medium">❌ {error}</span>
        </div>
      )}
    </div>
  );
}
