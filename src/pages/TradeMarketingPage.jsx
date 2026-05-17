import { useMemo, useState } from 'react';
import { useAuth, useLang, useToast } from '../App.jsx';
import Header from '../components/Header.jsx';
import SubmissionCard from '../components/SubmissionCard.jsx';
import SubmissionDetail from '../components/SubmissionDetail.jsx';
import ActionSelector from '../components/ActionSelector.jsx';
import ActionBadge from '../components/ActionBadge.jsx';
import PhotoViewer from '../components/PhotoViewer.jsx';
import { db } from '../lib/db.js';
import { useAllSubmissions } from '../lib/hooks.js';
import { fromDb } from '../lib/mapping.js';

const TABS = [
  { key: 'pending', icon: '📥', labelKey: 'pendingNew' },
  { key: 'history', icon: '📋', labelKey: 'history' },
];

export default function TradeMarketingPage() {
  const { tr } = useLang();
  const { signOut } = useAuth();
  const [tab, setTab] = useState('pending');
  const [openId, setOpenId] = useState(null);

  const { data: rows, loading } = useAllSubmissions();
  const subs = useMemo(() => (rows || []).map(fromDb), [rows]);

  const pending = useMemo(() => subs.filter((s) => s.status === 'pending_tm'), [subs]);
  const history = useMemo(() => subs.filter((s) => s.status !== 'pending_tm'), [subs]);

  const open = openId ? subs.find((s) => s.id === openId) : null;

  if (open) {
    return (
      <>
        <Header title={tr.tmDashboard} onBack={() => setOpenId(null)} onLogout={signOut} />
        <TMDetail submission={open} onDone={() => setOpenId(null)} />
      </>
    );
  }

  return (
    <>
      <Header title={tr.tmDashboard} onLogout={signOut} />
      <div className="flex border-b border-gray-200 bg-white sticky top-0 z-20">
        {TABS.map((t) => {
          const count = t.key === 'pending' ? pending.length : history.length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`tab-btn ${tab === t.key ? 'active' : ''}`}
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
        {loading ? (
          <p className="text-center text-gray-400 py-12 text-sm">…</p>
        ) : tab === 'pending' ? (
          pending.length === 0 ? <Empty /> : pending.map((s) => (
            <SubmissionCard key={s.id} submission={s} onClick={() => setOpenId(s.id)} />
          ))
        ) : history.length === 0 ? <Empty /> : history.map((s) => (
          <SubmissionCard key={s.id} submission={s} onClick={() => setOpenId(s.id)} />
        ))}
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

function TMDetail({ submission, onDone }) {
  const { tr } = useLang();
  const { toast } = useToast();
  const { user } = useAuth();
  const [action, setAction] = useState(submission.tmDecision || '');
  const [notes, setNotes] = useState(submission.tmNotes || '');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isPending = submission.status === 'pending_tm';

  const decide = async () => {
    if (!action) {
      toast(tr.chooseActionFirst, 'error');
      return;
    }
    if (action === 'no_action' && !confirmClose) {
      setConfirmClose(true);
      return;
    }

    setSubmitting(true);
    try {
      const patch = {
        tm_id: user.id,
        tm_decision: action,
        tm_notes: notes.trim() || null,
        tm_decision_date: new Date().toISOString(),
        status: action === 'no_action' ? 'closed_no_action' : 'pending_roshen',
      };
      await db.updateSubmission(submission.id, patch);
      toast(action === 'no_action' ? tr.closedRequest : tr.forwardedToRoshen, 'success');
      onDone();
    } catch (e) {
      console.error(e);
      toast(e.message || 'Error', 'error');
    } finally {
      setSubmitting(false);
      setConfirmClose(false);
    }
  };

  return (
    <div className="p-3 space-y-3 fade-in pb-8">
      <SubmissionDetail submission={submission} onViewPhotos={() => setViewerOpen(true)} />

      {isPending && (
        <>
          <div className="card p-4">
            <h3 className="font-bold text-sm mb-2">🟨 {tr.pickAction}</h3>
            <ActionSelector value={action} onChange={setAction} />
          </div>

          <label className="card p-4 block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">{tr.tmNotes}</span>
            <textarea
              className="input-field"
              rows={3}
              maxLength={200}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={tr.tmNotesPlaceholder}
            />
            <span className="text-[10px] text-gray-400 block mt-1 text-end">
              {notes.length} / 200
            </span>
          </label>

          {confirmClose && action === 'no_action' && (
            <div className="card p-3 bg-amber-50 border-amber-300 border-2">
              <p className="text-sm text-amber-900 font-semibold mb-2">
                ⚠️ {tr.confirmCloseNoAction}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmClose(false)}
                  className="btn-secondary flex-1 text-sm"
                  disabled={submitting}
                >
                  {tr.cancel}
                </button>
                <button onClick={decide} className="btn-primary flex-1 text-sm" disabled={submitting}>
                  {submitting ? '...' : tr.confirm}
                </button>
              </div>
            </div>
          )}

          {!confirmClose && (
            <button onClick={decide} disabled={!action || submitting} className="btn-primary w-full">
              {submitting ? '...' : `💾 ${tr.save}`}
            </button>
          )}

          {action && action !== 'no_action' && (
            <div className="text-center text-xs text-gray-500">
              <ActionBadge action={action} size="sm" /> → 📨 {tr.awaitingRoshen}
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
