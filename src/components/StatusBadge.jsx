import { useLang } from '../App.jsx';

const STATUS_STYLES = {
  draft:            { bg: '#f3f4f6', fg: '#374151', dot: '#9ca3af' },
  pending_tm:       { bg: '#fef3c7', fg: '#92400e', dot: '#d97706' },
  pending_roshen:   { bg: '#dbeafe', fg: '#1e40af', dot: '#2563eb' },
  approved:         { bg: '#dcfce7', fg: '#166534', dot: '#16a34a' },
  completed:        { bg: '#dcfce7', fg: '#166534', dot: '#16a34a' },
  closed_no_action: { bg: '#f3f4f6', fg: '#374151', dot: '#6b7280' },
  edited:           { bg: '#ede9fe', fg: '#5b21b6', dot: '#7c3aed' },
};

const STATUS_LABEL_KEY = {
  draft:            'visitDraft',
  pending_tm:       'visitPendingTm',
  pending_roshen:   'visitPendingRm',
  approved:         'itemApproved',
  completed:        'visitCompleted',
  closed_no_action: 'itemClosed',
  edited:           'statusEdited',
};

export default function StatusBadge({ status }) {
  const { tr } = useLang();
  const style = STATUS_STYLES[status] || STATUS_STYLES.pending_tm;
  const labelKey = STATUS_LABEL_KEY[status] || 'statusPending';
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: style.bg, color: style.fg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: style.dot }} aria-hidden />
      {tr[labelKey]}
    </span>
  );
}
