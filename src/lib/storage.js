// localStorage wrappers. All read paths return safe defaults on failure.

const KEYS = {
  LANG: 'nex_lang',
  AGG: 'nex_agg',
  SUBS: 'nex_subs',
  ECFG: 'nex_ecfg',
  PHOTO_EXPIRY: (id) => `nex_pe_${id}`,
  PHOTO_QTY: (id) => `nex_pq_${id}`,
};

const safeGet = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const safeSet = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('localStorage set failed:', key, e);
    return false;
  }
};

export const getAgg = () => safeGet(KEYS.AGG, {});
export const setAgg = (data) => safeSet(KEYS.AGG, data);
export const hasAgg = () => Object.keys(getAgg()).length > 0;

export const getSubs = () => {
  const arr = safeGet(KEYS.SUBS, []);
  return Array.isArray(arr) ? arr : [];
};
export const setSubs = (subs) => safeSet(KEYS.SUBS, subs);

export const addSub = (sub) => {
  const all = getSubs();
  all.unshift(sub);
  setSubs(all);
  return sub;
};

export const updateSub = (id, patch) => {
  const all = getSubs();
  const idx = all.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  setSubs(all);
  return all[idx];
};

export const getSubById = (id) => getSubs().find((s) => s.id === id) || null;

// Photos — stored separately so the submissions JSON stays small.
export const setPhotos = (id, expiryB64, qtyB64) => {
  try {
    if (expiryB64) localStorage.setItem(KEYS.PHOTO_EXPIRY(id), expiryB64);
    if (qtyB64) localStorage.setItem(KEYS.PHOTO_QTY(id), qtyB64);
    return true;
  } catch (e) {
    console.error('Failed to save photos', e);
    return false;
  }
};

export const getPhotoExpiry = (id) => {
  try {
    return localStorage.getItem(KEYS.PHOTO_EXPIRY(id));
  } catch {
    return null;
  }
};

export const getPhotoQty = (id) => {
  try {
    return localStorage.getItem(KEYS.PHOTO_QTY(id));
  } catch {
    return null;
  }
};

export const getEmailConfig = () =>
  safeGet(KEYS.ECFG, {
    publicKey: '',
    serviceId: '',
    templateId: '',
    templateIdEdit: '',
    rmEmail: '',
    tmEmail: '',
  });

export const setEmailConfig = (cfg) => safeSet(KEYS.ECFG, cfg);

export const isEmailConfigReady = (cfg) =>
  !!(cfg?.publicKey && cfg?.serviceId && cfg?.templateId && cfg?.tmEmail);
