import { useEffect, useMemo, useState } from 'react';
import { useAuth, useLang, useToast } from '../App.jsx';
import { buildEmail } from '../lib/emailHtml.js';
import { db } from '../lib/db.js';
import { visitItemFromDb } from '../lib/mapping.js';
import PdfButton from './PdfButton.jsx';

export default function EmailModal({ visit, items: providedItems, onClose }) {
  const { tr } = useLang();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState(providedItems || null);
  const [loading, setLoading] = useState(!providedItems);

  // Lazy-load items if the caller didn't pass them (e.g. opening from a card).
  useEffect(() => {
    if (providedItems) {
      setItems(providedItems);
      setLoading(false);
      return;
    }
    let active = true;
    db.listVisitItems(visit.id).then((rows) => {
      if (!active) return;
      setItems(rows.map(visitItemFromDb));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [visit.id, providedItems]);

  const { subject, html, plainText } = useMemo(() => {
    if (!items) return { subject: '', html: '', plainText: '' };
    return buildEmail({
      role: profile.role,
      senderName: profile.full_name,
      visit,
      items,
    });
  }, [profile.role, profile.full_name, visit, items]);

  const copyPlain = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(tr.copied, 'success');
    } catch (e) {
      toast(e.message || 'Copy failed', 'error');
    }
  };

  const copyRich = async () => {
    // Prefer rich (HTML + plain) copy so Outlook/Gmail render the table.
    try {
      if (
        typeof window !== 'undefined' &&
        typeof window.ClipboardItem === 'function' &&
        navigator.clipboard &&
        navigator.clipboard.write
      ) {
        const blobHtml = new Blob([html], { type: 'text/html' });
        const blobText = new Blob([plainText], { type: 'text/plain' });
        await navigator.clipboard.write([
          new window.ClipboardItem({
            'text/html': blobHtml,
            'text/plain': blobText,
          }),
        ]);
        toast(tr.copied, 'success');
        return;
      }
    } catch (e) {
      console.warn('Rich clipboard copy failed, falling back to text', e);
    }
    // Fallback: plain-text copy.
    try {
      await navigator.clipboard.writeText(plainText);
      toast(tr.copied, 'success');
    } catch (e) {
      toast(e.message || 'Copy failed', 'error');
    }
  };

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-2 sm:p-4">
      <div className="card w-full max-w-2xl max-h-[92vh] overflow-y-auto fade-in">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between rounded-t-card z-10">
          <h2 className="font-bold">✉️ {tr.emailLabel}</h2>
          <button
            onClick={onClose}
            className="bg-gray-100 hover:bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center"
            aria-label="close"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          {loading ? (
            <p className="text-center text-gray-400 py-8 text-sm">{tr.emailPreparing}</p>
          ) : (
            <>
              <p className="text-xs text-gray-500 leading-relaxed">{tr.emailInstructions}</p>

              {/* Subject */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  {tr.emailSubject}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={subject}
                    dir="ltr"
                    className="input-field text-xs flex-1"
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    type="button"
                    onClick={() => copyPlain(subject)}
                    className="btn-secondary text-xs whitespace-nowrap"
                  >
                    📋 {tr.copySubject}
                  </button>
                </div>
              </div>

              {/* Body preview */}
              <div>
                <div className="flex items-center justify-between mb-1 gap-2">
                  <label className="block text-xs font-semibold text-gray-600">
                    {tr.emailBody}
                  </label>
                  <button
                    type="button"
                    onClick={copyRich}
                    className="btn-secondary text-xs whitespace-nowrap"
                  >
                    📋 {tr.copyBody}
                  </button>
                </div>
                <div
                  dir="ltr"
                  className="border border-gray-300 rounded-input p-3 max-h-96 overflow-y-auto bg-white"
                  // Email HTML is built from controlled inputs; all dynamic
                  // strings go through `escape()` in lib/emailHtml.js.
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button onClick={onClose} className="btn-secondary flex-1">
                  {tr.cancel}
                </button>
                <div className="flex-1">
                  <PdfButton
                    visit={visit}
                    items={items}
                    size="md"
                    stop={false}
                    fullWidth
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
