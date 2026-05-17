import { useMemo, useState } from 'react';
import { useAuth, useLang } from '../App.jsx';
import { useMySubmissions } from '../lib/hooks.js';
import { fromDb } from '../lib/mapping.js';
import SubmissionCard from './SubmissionCard.jsx';
import SubmissionDetail from './SubmissionDetail.jsx';
import PhotoViewer from './PhotoViewer.jsx';

const TABS = [
  { key: 'review', icon: '📥', labelKey: 'underReview' },
  { key: 'approved', icon: '✅', labelKey: 'approved' },
  { key: 'closed', icon: '🔒', labelKey: 'closed' },
];

export default function MySubmissionsTracker() {
  const { tr } = useLang();
  const { user } = useAuth();
  const [tab, setTab] = useState('review');
  const [openId, setOpenId] = useState(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const { data: rows, loading } = useMySubmissions(user?.id);
  const mine = useMemo(() => (rows || []).map(fromDb), [rows]);

  const filtered = useMemo(() => {
    if (tab === 'review')
      return mine.filter(
        (s) => s.status === 'pending_tm' || s.status === 'pending_roshen',
      );
    if (tab === 'approved') return mine.filter((s) => s.status === 'approved');
    return mine.filter((s) => s.status === 'closed_no_action');
  }, [tab, mine]);

  const open = openId ? mine.find((s) => s.id === openId) : null;

  if (open) {
    return (
      <div className="p-3 space-y-3 fade-in">
        <button onClick={() => setOpenId(null)} className="btn-ghost text-sm">
          ← {tr.back}
        </button>
        <SubmissionDetail
          submission={open}
          onViewPhotos={() => setViewerOpen(true)}
        />
        {viewerOpen && (
          <PhotoViewer submission={open} onClose={() => setViewerOpen(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="flex border-b border-gray-200 bg-white sticky top-0 z-10">
        {TABS.map((t) => {
          const count = mine.filter((s) =>
            t.key === 'review'
              ? s.status === 'pending_tm' || s.status === 'pending_roshen'
              : t.key === 'approved'
              ? s.status === 'approved'
              : s.status === 'closed_no_action'
          ).length;
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

      <div className="p-3 space-y-2.5">
        {loading ? (
          <p className="text-center text-gray-400 py-12 text-sm">…</p>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-500 py-12 text-sm">
            <p className="text-3xl mb-2">📭</p>
            <p>{tr.noSubmissions}</p>
          </div>
        ) : (
          filtered.map((s) => (
            <SubmissionCard key={s.id} submission={s} onClick={() => setOpenId(s.id)} />
          ))
        )}
      </div>
    </div>
  );
}
