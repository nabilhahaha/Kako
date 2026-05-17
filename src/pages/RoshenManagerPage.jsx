import { useMemo, useState } from 'react';
import { useAuth, useLang, useToast } from '../App.jsx';
import Header from '../components/Header.jsx';
import SubmissionCard from '../components/SubmissionCard.jsx';
import SubmissionDetail from '../components/SubmissionDetail.jsx';
import ActionSelector from '../components/ActionSelector.jsx';
import PhotoViewer from '../components/PhotoViewer.jsx';
import EditCountdown from '../components/EditCountdown.jsx';
import UserManagementPanel from '../components/UserManagementPanel.jsx';
import { db } from '../lib/db.js';
import { parseExcel } from '../lib/excel.js';
import { isEditable } from '../lib/utils.js';
import { fromDb } from '../lib/mapping.js';
import { useAllSubmissions, useAggregatedData } from '../lib/hooks.js';

const TABS = [
  { key: 'upload', icon: '📥', labelKey: 'uploadData' },
  { key: 'pending', icon: '⏳', labelKey: 'awaitingMyDecision' },
  { key: 'mine', icon: '📋', labelKey: 'myDecisions' },
  { key: 'users', icon: '👥', labelKey: 'userManagement' },
];

export default function RoshenManagerPage() {
  const { tr } = useLang();
  const { signOut } = useAuth();
  const [tab, setTab] = useState('pending');
  const [openId, setOpenId] = useState(null);

  const { data: rows, loading } = useAllSubmissions();
  const subs = useMemo(() => (rows || []).map(fromDb), [rows]);

  const pending = useMemo(() => subs.filter((s) => s.status === 'pending_roshen'), [subs]);
  const mine = useMemo(() => subs.filter((s) => s.status === 'approved'), [subs]);

  const open = openId ? subs.find((s) => s.id === openId) : null;

  if (open) {
    return (
      <>
        <Header title={tr.rmDashboard} onBack={() => setOpenId(null)} onLogout={signOut} />
        <RMDetail submission={open} onDone={() => setOpenId(null)} />
      </>
    );
  }

  return (
    <>
      <Header title={tr.rmDashboard} onLogout={signOut} />
      <div className="flex border-b border-gray-200 bg-white sticky top-0 z-20 overflow-x-auto">
        {TABS.map((t) => {
          const count =
            t.key === 'pending' ? pending.length : t.key === 'mine' ? mine.length : 0;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`tab-btn whitespace-nowrap shrink-0 ${tab === t.key ? 'active' : ''}`}
            >
              {t.icon} {tr[t.labelKey]}
              {count > 0 && (
                <span className="ms-1 text-[10px] bg-gray-200 text-gray-700 rounded-full px-1.5 py-0.5">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="p-3 space-y-2.5 fade-in">
        {tab === 'upload' && <UploadPanel />}
        {tab === 'pending' &&
          (loading ? (
            <p className="text-center text-gray-400 py-12 text-sm">…</p>
          ) : pending.length === 0 ? (
            <Empty />
          ) : (
            pending.map((s) => (
              <SubmissionCard key={s.id} submission={s} onClick={() => setOpenId(s.id)} />
            ))
          ))}
        {tab === 'mine' &&
          (loading ? (
            <p className="text-center text-gray-400 py-12 text-sm">…</p>
          ) : mine.length === 0 ? (
            <Empty />
          ) : (
            mine.map((s) => (
              <SubmissionCard key={s.id} submission={s} showCountdown onClick={() => setOpenId(s.id)} />
            ))
          ))}
        {tab === 'users' && <UserManagementPanel />}
      </div>
    </>
  );
}

function Empty() {
  const { tr } = useLang();
  return (
    <div className="text-center text-gray-500 py-12 text-sm">
      <p className="text-3xl mb-2">📭</p>
      <p>{tr.noSubmissions}</p>
    </div>
  );
}

/* ───────── Upload Excel ───────── */
function UploadPanel() {
  const { tr } = useLang();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [stats, setStats] = useState(null);
  const { data: existing } = useAggregatedData();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setStats(null);
    try {
      const { agg, stats: s } = await parseExcel(file);
      if (s.salesmen === 0) {
        toast('Empty file — check column names', 'error');
        return;
      }
      await db.uploadAggregated({
        data: agg,
        salesmen: s.salesmen,
        customers: s.customers,
        items: s.items,
        filename: file.name,
      });
      setStats(s);
      toast(tr.uploadSuccess, 'success');
    } catch (err) {
      console.error(err);
      toast(err.message || 'Parse failed', 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <div className="card p-5">
        <h2 className="font-bold text-base mb-1">📥 {tr.uploadExcel}</h2>
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">{tr.uploadExcelHint}</p>

        <label
          htmlFor="excel-upload"
          className="block border-2 border-dashed border-roshen-300 hover:border-roshen-500 transition rounded-card p-6 text-center cursor-pointer bg-roshen-50/40"
        >
          <div className="text-4xl mb-2">{uploading ? '⏳' : '📊'}</div>
          <p className="font-semibold text-roshen-700">
            {uploading ? tr.uploading : tr.chooseFile}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">.xlsx / .xls</p>
        </label>
        <input
          id="excel-upload"
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          disabled={uploading}
          onChange={onFile}
        />
      </div>

      {stats && (
        <div className="card p-4 bg-green-50 border-green-200">
          <h3 className="font-bold text-green-800 mb-2 text-sm">✅ {tr.uploadSuccess}</h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            <StatCell label={tr.salesmenCount} value={stats.salesmen} />
            <StatCell label={tr.customersCount} value={stats.customers} />
            <StatCell label={tr.itemsCount} value={stats.items} />
          </div>
        </div>
      )}

      {!stats && existing && (
        <div className="card p-4 bg-blue-50 border-blue-200">
          <p className="text-xs text-blue-800 font-semibold">
            ℹ️ {existing.salesmen_count} {tr.salesmenCount} · {existing.customers_count}{' '}
            {tr.customersCount} · {existing.items_count} {tr.itemsCount}
          </p>
          {existing.source_filename && (
            <p className="text-[11px] text-blue-700 mt-1" dir="ltr">
              {existing.source_filename}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value }) {
  return (
    <div className="bg-white rounded-lg p-2 border border-green-200">
      <p className="text-xl font-bold text-green-700">{value.toLocaleString()}</p>
      <p className="text-[10px] text-gray-500">{label}</p>
    </div>
  );
}

/* ───────── RM Detail / Final Decision ───────── */
function RMDetail({ submission, onDone }) {
  const { tr, lang } = useLang();
  const { toast } = useToast();
  const { user } = useAuth();

  const isApproved = submission.status === 'approved';
  const canEdit = isApproved && isEditable(submission);
  const isFreshPending = submission.status === 'pending_roshen';

  const [mode, setMode] = useState(isFreshPending ? 'decide' : 'view');
  const [action, setAction] = useState(
    submission.roshenDecision || submission.tmDecision || '',
  );
  const [notes, setNotes] = useState(submission.roshenNotes || '');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmStage, setConfirmStage] = useState(false);

  const submit = async () => {
    if (!action) {
      toast(tr.chooseActionFirst, 'error');
      return;
    }
    if (!confirmStage) {
      setConfirmStage(true);
      return;
    }

    setSubmitting(true);
    try {
      const isEdit = mode === 'edit';
      const now = new Date().toISOString();

      const patch = {
        rm_id: user.id,
        rm_decision: action,
        rm_notes: notes.trim() || null,
      };

      if (isEdit) {
        const newHistoryEntry = {
          timestamp: now,
          previousAction: submission.roshenDecision,
          newAction: action,
          previousNotes: submission.roshenNotes || '',
        };
        patch.edit_history = [...(submission.editHistory || []), newHistoryEntry];
      } else {
        patch.rm_decision_date = now;
        patch.status = 'approved';
      }

      await db.updateSubmission(submission.id, patch);

      // Fire email — non-fatal if it fails.
      try {
        toast(tr.sendingEmail);
        await db.sendDecisionEmail({
          submission_id: submission.id,
          is_edit: isEdit,
          lang,
        });
        toast(isEdit ? tr.decisionUpdated : tr.emailSent, 'success');
      } catch (emailErr) {
        console.error(emailErr);
        toast(tr.emailFailed + ': ' + emailErr.message, 'error');
      }
      onDone();
    } catch (e) {
      console.error(e);
      toast(e.message || 'Error', 'error');
    } finally {
      setSubmitting(false);
      setConfirmStage(false);
    }
  };

  const showForm = mode === 'decide' || mode === 'edit';

  return (
    <div className="p-3 space-y-3 fade-in pb-8">
      <SubmissionDetail submission={submission} onViewPhotos={() => setViewerOpen(true)} />

      {isApproved && mode === 'view' && (
        <div className="card p-3 flex items-center justify-between">
          <EditCountdown submission={submission} />
          {canEdit && (
            <button onClick={() => setMode('edit')} className="btn-secondary text-sm">
              ✏️ {tr.editDecision}
            </button>
          )}
        </div>
      )}

      {showForm && (
        <>
          <div className="card p-4">
            <h3 className="font-bold text-sm mb-1">
              🟩 {mode === 'edit' ? tr.editDecision : tr.yourFinalDecision}
            </h3>
            <p className="text-[11px] text-gray-500 mb-3">{tr.finalDecisionPrompt}</p>
            <ActionSelector value={action} onChange={setAction} />
          </div>

          <label className="card p-4 block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">{tr.rmNotes}</span>
            <textarea
              className="input-field"
              rows={4}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={tr.rmNotesPlaceholder}
            />
            <span className="text-[10px] text-gray-400 block mt-1 text-end">
              {notes.length} / 500
            </span>
          </label>

          {confirmStage && (
            <div className="card p-3 bg-amber-50 border-amber-300 border-2">
              <p className="text-sm text-amber-900 font-semibold mb-2">
                ⚠️ {mode === 'edit' ? tr.confirmEditDecision : tr.confirmFinalDecision}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmStage(false)}
                  className="btn-secondary flex-1 text-sm"
                  disabled={submitting}
                >
                  {tr.cancel}
                </button>
                <button onClick={submit} className="btn-primary flex-1 text-sm" disabled={submitting}>
                  {submitting ? '...' : tr.confirm}
                </button>
              </div>
            </div>
          )}

          {!confirmStage && (
            <div className="flex gap-2">
              {mode === 'edit' && (
                <button
                  onClick={() => {
                    setMode('view');
                    setAction(submission.roshenDecision || '');
                    setNotes(submission.roshenNotes || '');
                  }}
                  className="btn-secondary flex-1"
                >
                  {tr.cancel}
                </button>
              )}
              <button onClick={submit} disabled={!action || submitting} className="btn-primary flex-1">
                ✅ {tr.approveAndSend}
              </button>
            </div>
          )}
        </>
      )}

      {viewerOpen && (
        <PhotoViewer submission={submission} onClose={() => setViewerOpen(false)} />
      )}
    </div>
  );
}
