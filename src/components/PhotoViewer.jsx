import { useEffect, useState } from 'react';
import { useLang } from '../App.jsx';
import { getPhotoExpiry, getPhotoQty } from '../lib/storage.js';

export default function PhotoViewer({ submissionId, onClose }) {
  const { tr } = useLang();
  const [expiry, setExpiry] = useState(null);
  const [qty, setQty] = useState(null);
  const [view, setView] = useState('expiry');

  useEffect(() => {
    setExpiry(getPhotoExpiry(submissionId));
    setQty(getPhotoQty(submissionId));
  }, [submissionId]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const current = view === 'expiry' ? expiry : qty;

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
        {current ? (
          <img src={current} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
        ) : (
          <p className="text-white/70">No image available</p>
        )}
      </div>
    </div>
  );
}
