import { useEffect, useState } from 'react';
import { useLang, useToast } from '../App.jsx';
import { db } from '../lib/db.js';
import { parseVanStockExcel } from '../lib/vanExcel.js';
import { fmtDateTime, calcDays } from '../lib/utils.js';

// Excel-upload panel shared by the RM and TM dashboards.
export default function VanStockUploadPanel() {
  const { tr, lang } = useLang();
  const { toast } = useToast();
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(null); // { rows, stats }
  const [uploading, setUploading] = useState(false);
  const [unmatched, setUnmatched] = useState([]);
  const [done, setDone] = useState(null);     // { stats, unmatched }
  const [lastUpload, setLastUpload] = useState(null);

  useEffect(() => {
    let active = true;
    db.getLatestVanUpload().then((u) => {
      if (active) setLastUpload(u);
    });
    return () => {
      active = false;
    };
  }, [done]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setParsed(null);
    setDone(null);
    setUnmatched([]);
    try {
      const result = await parseVanStockExcel(file);
      setParsed({ ...result, filename: file.name });

      // Compare warehouse codes against the salesman profiles.
      const salesmen = await db.listSalesmanWarehouses();
      const known = new Set(
        salesmen
          .map((s) => (s.warehouse_code || '').trim())
          .filter(Boolean),
      );
      const missing = result.stats.warehouses_seen.filter((w) => !known.has(w));
      setUnmatched(missing);
    } catch (err) {
      console.error(err);
      toast(err.message || 'Parse failed', 'error');
    } finally {
      setParsing(false);
      e.target.value = '';
    }
  };

  const confirmUpload = async () => {
    if (!parsed || uploading) return;
    setUploading(true);
    try {
      await db.uploadVanStock({
        rows: parsed.rows,
        stats: parsed.stats,
        filename: parsed.filename,
      });
      setDone({ stats: parsed.stats, unmatched });
      setParsed(null);
      toast(tr.vanUploadDone, 'success');
    } catch (err) {
      console.error(err);
      toast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  // Age of the last upload (in whole days).
  const lastUploadAgeDays =
    lastUpload?.uploaded_at != null ? -calcDays(lastUpload.uploaded_at) : null;

  return (
    <div className="space-y-3 fade-in">
      <div className="card p-5">
        <h2 className="font-bold text-base mb-1">🚐 {tr.uploadVanStock}</h2>
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
          {tr.uploadVanStockHint}
        </p>

        <label
          htmlFor="vanstock-upload"
          className="block border-2 border-dashed border-roshen-300 hover:border-roshen-500 transition rounded-card p-6 text-center cursor-pointer bg-roshen-50/40"
        >
          <div className="text-4xl mb-2">{parsing ? '⏳' : '📊'}</div>
          <p className="font-semibold text-roshen-700">
            {parsing ? tr.vanProcessing : tr.chooseFile}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">.xlsx / .xls</p>
        </label>
        <input
          id="vanstock-upload"
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          disabled={parsing || uploading}
          onChange={onFile}
        />
      </div>

      {/* Preview + confirm */}
      {parsed && (
        <div className="card p-4 space-y-2">
          <h3 className="font-bold text-sm">{parsed.filename}</h3>
          <p className="text-[11px] text-gray-500" dir="ltr">
            Header row detected at row {parsed.stats.header_row_index + 1}
            {' · '}
            {parsed.stats.header_row_preview.join(' / ')}
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label={tr.vanRowsTotal} value={parsed.stats.total} tone="blue" />
            <Stat label={tr.vanRowsImported} value={parsed.stats.imported} tone="green" />
            <Stat
              label={tr.vanRowsSkipped}
              value={
                parsed.stats.skipped.inactive +
                parsed.stats.skipped.missing +
                parsed.stats.skipped.bad_date
              }
              tone="amber"
            />
          </div>
          <ul className="text-[11px] text-gray-500 space-y-0.5 pt-1">
            <li>• {tr.vanSkippedInactive}: <strong>{parsed.stats.skipped.inactive}</strong></li>
            <li>• {tr.vanSkippedMissing}: <strong>{parsed.stats.skipped.missing}</strong></li>
            <li>• {tr.vanSkippedBadDate}: <strong>{parsed.stats.skipped.bad_date}</strong></li>
          </ul>

          {/* First 5 rows preview */}
          <div className="overflow-x-auto -mx-4 pt-2">
            <table className="text-[11px] w-full">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-2 py-1 text-start">Item</th>
                  <th className="px-2 py-1 text-start">Qty</th>
                  <th className="px-2 py-1 text-start">Warehouse</th>
                  <th className="px-2 py-1 text-start">Expiry</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-2 py-1">
                      <span className="font-mono text-gray-500">{r.item_number}</span>
                      <br />
                      <span className="text-gray-800">{r.item_name}</span>
                    </td>
                    <td className="px-2 py-1">{r.available_qty} {r.sk_unit || ''}</td>
                    <td className="px-2 py-1 font-mono" dir="ltr">{r.warehouse_code}</td>
                    <td className="px-2 py-1">{r.expiry_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {unmatched.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-2 text-[11px] text-amber-900">
              <p className="font-semibold mb-1">⚠️ {tr.vanUnmatchedWarehouses} ({unmatched.length})</p>
              <p className="font-mono break-all" dir="ltr">{unmatched.slice(0, 30).join(', ')}{unmatched.length > 30 ? '…' : ''}</p>
            </div>
          )}

          <button
            onClick={confirmUpload}
            disabled={uploading}
            className="btn-primary w-full mt-2"
          >
            {uploading ? '...' : `📤 ${tr.uploadVanStock} (${parsed.rows.length})`}
          </button>
        </div>
      )}

      {/* Results summary */}
      {done && (
        <div className="card p-4 bg-green-50 border-green-200">
          <h3 className="font-bold text-green-800 mb-2 text-sm">✅ {tr.vanUploadDone}</h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label={tr.vanRowsTotal} value={done.stats.total} tone="blue" />
            <Stat label={tr.vanRowsImported} value={done.stats.imported} tone="green" />
            <Stat
              label={tr.vanRowsSkipped}
              value={
                done.stats.skipped.inactive +
                done.stats.skipped.missing +
                done.stats.skipped.bad_date
              }
              tone="amber"
            />
          </div>
          {done.unmatched.length > 0 && (
            <p className="text-[11px] text-amber-700 mt-2">
              ⚠️ {tr.vanUnmatchedWarehouses}: {done.unmatched.length}
            </p>
          )}
        </div>
      )}

      {/* Last-upload footer */}
      {lastUpload && (
        <div className="card p-3 bg-blue-50 border-blue-200">
          <p className="text-[11px] text-blue-800 font-semibold">
            ℹ️ {tr.vanLastUploadAt}: {fmtDateTime(lastUpload.uploaded_at, lang)}
            {lastUploadAgeDays > 1 ? ` · ${tr.vanDataAgeDays.replace('{n}', lastUploadAgeDays)}` : ''}
          </p>
          {lastUpload.source_filename && (
            <p className="text-[10px] text-blue-700 mt-0.5 truncate" dir="ltr">
              {lastUpload.source_filename}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = 'blue' }) {
  const toneCls =
    tone === 'green' ? 'border-green-200 text-green-700'
    : tone === 'amber' ? 'border-amber-200 text-amber-700'
    : 'border-blue-200 text-blue-700';
  return (
    <div className={`bg-white rounded-lg p-2 border ${toneCls}`}>
      <p className="text-lg font-bold">{value.toLocaleString()}</p>
      <p className="text-[10px] text-gray-500">{label}</p>
    </div>
  );
}
