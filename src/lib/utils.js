// Shared utilities.

export const genId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

export const calcDays = (expiryISO) => {
  if (!expiryISO) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryISO);
  expiry.setHours(0, 0, 0, 0);
  const diffMs = expiry.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
};

export const daysColor = (days) => {
  if (days < 0) return { fg: '#7f1d1d', bg: '#fecaca', label: 'expired' };
  if (days <= 30) return { fg: '#dc2626', bg: '#fee2e2', label: 'critical' };
  if (days <= 60) return { fg: '#d97706', bg: '#fef3c7', label: 'warning' };
  return { fg: '#16a34a', bg: '#dcfce7', label: 'safe' };
};

export const fmtDate = (iso, lang = 'ar') => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const locale = lang === 'ar' ? 'ar-EG' : 'en-GB';
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
};

export const fmtDateTime = (iso, lang = 'ar') => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const locale = lang === 'ar' ? 'ar-EG' : 'en-GB';
  return (
    d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  );
};

export const EDIT_WINDOW_HOURS = 48;

export const isEditable = (submission) => {
  if (!submission?.roshenDecisionDate) return false;
  const decisionTime = new Date(submission.roshenDecisionDate).getTime();
  const hoursElapsed = (Date.now() - decisionTime) / (1000 * 60 * 60);
  return hoursElapsed < EDIT_WINDOW_HOURS;
};

export const hoursRemaining = (submission) => {
  if (!submission?.roshenDecisionDate) return 0;
  const decisionTime = new Date(submission.roshenDecisionDate).getTime();
  const expiryTime = decisionTime + EDIT_WINDOW_HOURS * 60 * 60 * 1000;
  return Math.max(0, Math.round((expiryTime - Date.now()) / (1000 * 60 * 60)));
};

export const compressImage = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.onload = () => {
        const MAX = 1024;
        let w = img.width;
        let h = img.height;
        if (w > MAX) {
          h = h * (MAX / w);
          w = MAX;
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w);
        canvas.height = Math.round(h);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

export const cls = (...parts) => parts.filter(Boolean).join(' ');
