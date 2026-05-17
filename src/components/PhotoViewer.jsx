import { useEffect, useState } from 'react';
import { useLang } from '../App.jsx';
import { db } from '../lib/db.js';

export default function PhotoViewer({ submission, onClose }) {
  const { tr } = useLang();
  const [expiryUrl, setExpiryUrl] = useState(null);
  const [qtyUrl, setQtyUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('expiry');

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      submission?.photoExpiryPath ? db.getPhotoUrl(submission.photoExpiryPath) : null,
      submission?.photoQtyPath ? db.getPhotoUrl(submission.photoQtyPath) : null,
    ])
      .then(([e, q]) => {
        if (!active) return;
        setExpiryUrl(e);
        setQtyUrl(q);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [submission?.id]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const current = view === 'expiry' ? expiryUrl : qtyUrl;

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
      <div className="flex items-center justify-between p-3 text-white">
        <div className="flex gap-2">
          <button
            onClick={() => setView('expiry')}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
              view === 'expiry' ? 'bg-white text-black' : 'bg-white/15'
            }`}
          >
            📅 {tr.expiryPhoto}
          </button>
          <button
            onClick={() => setView('qty')}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
              view === 'qty' ? 'bg-white text-black' : 'bg-white/15'
            }`}
          >
            📦 {tr.qtyPhoto}
          </button>
        </div>
        <button
          onClick={onClose}
          className="bg-white/15 hover:bg-white/25 rounded-full w-10 h-10 flex items-center justify-center text-xl"
          aria-label={tr.closePhoto}
        >
          ✕
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
        {loading ? (
          <p className="text-white/70 text-sm">…</p>
        ) : current ? (
          <img src={current} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
        ) : (
          <p className="text-white/70">No image available</p>
        )}
      </div>
    </div>
  );
}
