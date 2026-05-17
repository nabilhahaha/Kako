// The 4 core action codes used throughout the workflow.

export const ACTION_CODES = ['promo_1_1', 'promo_2_1', 'pull_resell', 'no_action'];

export const ACTION_LABELS = {
  promo_1_1: { ar: 'عرض 1+1', en: '1+1 Promotion' },
  promo_2_1: { ar: 'عرض 2+1', en: '2+1 Promotion' },
  pull_resell: { ar: 'سحب البضاعة وإعادة بيعها', en: 'Pull stock and resell' },
  no_action: { ar: 'لا يوجد إجراء', en: 'No action' },
};

export const ACTION_ICONS = {
  promo_1_1: '🎁',
  promo_2_1: '🎁🎁',
  pull_resell: '🔄',
  no_action: '🚫',
};

export const ACTION_COLORS = {
  promo_1_1: { fg: '#0891b2', bg: '#cffafe', border: '#22d3ee' },
  promo_2_1: { fg: '#7c3aed', bg: '#ede9fe', border: '#a78bfa' },
  pull_resell: { fg: '#ea580c', bg: '#ffedd5', border: '#fb923c' },
  no_action: { fg: '#6b7280', bg: '#f3f4f6', border: '#9ca3af' },
};

export const labelFor = (code, lang = 'ar') =>
  code && ACTION_LABELS[code] ? ACTION_LABELS[code][lang] : '—';
