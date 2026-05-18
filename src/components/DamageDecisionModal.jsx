import { useState } from 'react';
import { useAuth, useLang, useToast } from '../App.jsx';
import { db } from '../lib/db.js';

// TM-side write-once decision dialog. The same RLS policy that limits this
// to status='submitted' will reject a second attempt — making the comment
// effectively write-once on the server side too.
export default function DamageDecisionModal({ request, decision, onClose, onDone }) {
  const { tr } = useLang();
  const { user } = useAuth();
  const { toast } = useToast();
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isApprove = decision === 'approve';
  const titleKey =
    !isApprove
      ? 'damageDecisionTitleReject'
      : request.sourceType === 'van'
      ? 'damageDecisionTitleVanApprove'
      : 'damageDecisionTitleCustomerApprove';

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await db.decideDamageRequest(request.id, {
        status: isApprove ? 'tm_approved' : 'tm_rejected',
        tm_comment: comment.trim() || null,
        tm_decided_at: new Date().toISOString(),
        tm_decided_by: user.id,
      });
      toast(tr.damageDecisionRecorded, 'success');
      onDone?.();
    } catch (e) {
      console.error(e);
      toast(e.message || tr.damageDecisionLocked, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-2 sm:p-4">
      <div className="card w-full max-w-page max-h-[92vh] overflow-y-auto fade-in">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between rounded-t-card z-10">
          <h2 className="font-bold text-base">
            {isApprove ? '✅' : '❌'} {tr[titleKey]}
          </h2>
          <button
            onClick={onClose}
            className="bg-gray-100 hover:bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center"
          >
            ✕
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="card p-3 bg-gray-50">
            <p className="text-xs text-gray-500">{tr.damageRequestId}</p>
            <p className="font-mono text-sm" dir="ltr">#{request.id.slice(-6)}</p>
            <p className="text-xs text-gray-500 mt-2">{tr.salesman}</p>
            <p className="text-sm font-semibold">{request.salesmanName}</p>
            <p className="text-xs text-gray-500 mt-2">{tr.damageSource}</p>
            <p className="text-sm">
              {request.sourceType === 'van'
                ? tr.damageSourceVan
                : `${request.custName} (${request.custAccount})`}
            </p>
          </div>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">
              {tr.damageTmComment}
            </span>
            <textarea
              className="input-field"
              rows={4}
              maxLength={500}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={tr.damageTmCommentPlaceholder}
              autoFocus
              style={{ fontSize: '16px' }}
            />
            <span className="block text-[10px] text-gray-400 text-end mt-1">
              {comment.length} / 500
            </span>
          </label>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary flex-1" disabled={submitting}>
              {tr.cancel}
            </button>
            <button
              onClick={submit}
              className={`flex-1 rounded-input px-4 py-3 font-semibold text-white transition active:scale-[0.98] disabled:opacity-50 ${
                isApprove ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
              }`}
              disabled={submitting}
            >
              {submitting ? '...' : `${isApprove ? '✅' : '❌'} ${tr.damageSubmitDecision}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
