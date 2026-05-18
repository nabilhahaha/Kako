import { useEffect, useMemo, useState } from 'react';
import { useAuth, useLang, useToast } from '../App.jsx';
import { buildEmail, buildDamageEmail } from '../lib/emailHtml.js';
import { db } from '../lib/db.js';
import { visitItemFromDb, damageItemFromDb } from '../lib/mapping.js';
import PdfButton from './PdfButton.jsx';

// Renders a copy-friendly email subject + HTML body preview for either a
// visit (Near Expiry) or a damage request — dispatched by which prop is set.
export default function EmailModal({ visit, damageRequest, items: providedItems, onClose }) {
  const { tr } = useLang();
  const { profile } = useAuth();
  const { toast } = useToast();

  const target = damageRequest
    ? { kind: 'damage', id: damageRequest.id }
    : { kind: 'visit', id: visit?.id };

  const [items, setItems] = useState(providedItems || null);
  const [loading, setLoading] = useState(!providedItems);

  useEffect(() => {
    if (providedItems) {
      setItems(providedItems);
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      try {
        const rows = target.kind === 'damage'
          ? await db.listDamageItems(target.id)
          : await db.listVisitItems(target.id);
        if (!active) return;
        setItems(rows.map(target.kind === 'damage' ? damageItemFromDb : visitItemFromDb));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [target.id, target.kind, providedItems]);

  const { subject, html, plainText } = useMemo(() => {
    if (!items) return { subject: '', html: '', plainText: '' };
    if (target.kind === 'damage') {
      return buildDamageEmail({
        senderName: profile.full_name,
        request: damageRequest,
        items,
      });
    }
    return buildEmail({
      role: profile.role,
      senderName: profile.full_name,
      visit,
      items,
    });
  }, [target.kind, profile.role, profile.full_name, visit, damageRequest, items]);

  const copyPlain = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(tr.copied, 'success');
    } catch (e) {
      toast(e.message || 'Copy failed', 'error');
    }
  };

  const copyRich = async () => {
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
    try {
      await navigator.clipboard.writeText(plainText);
      toast(tr.copied, 'success');
    } catch (e) {
      toast(e.message || 'Copy failed', 'error');
    }
  };

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
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </div>
              <div className="flex gap-2">
                <button onClick={onClose} className="btn-secondary flex-1">
                  {tr.cancel}
                </button>
                <div className="flex-1">
                  <PdfButton
                    visit={visit}
                    damageRequest={damageRequest}
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
