import { useEffect, useState } from 'react';
import { useLang } from '../App.jsx';
import { hoursRemaining, isEditable } from '../lib/utils.js';

export default function EditCountdown({ submission }) {
  const { tr } = useLang();
  const [, force] = useState(0);

  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!submission?.roshenDecisionDate) return null;

  if (!isEditable(submission)) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-gray-200 text-gray-600">
        {tr.editLocked}
      </span>
    );
  }

  const h = hoursRemaining(submission);
  const tone =
    h > 24
      ? { bg: '#dcfce7', fg: '#166534' }
      : h > 6
      ? { bg: '#fef3c7', fg: '#92400e' }
      : { bg: '#fee2e2', fg: '#991b1b' };

  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full"
      style={{ background: tone.bg, color: tone.fg }}
    >
      ⏱ {tr.editableHoursLeft.replace('{h}', h)}
    </span>
  );
}
