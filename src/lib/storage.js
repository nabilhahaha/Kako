// Only UI preference (language) lives in localStorage now.
// All business data is on Supabase. See src/lib/db.js.

const LANG_KEY = 'nex_lang';

export const getLangPref = () => {
  try {
    return localStorage.getItem(LANG_KEY) || 'ar';
  } catch {
    return 'ar';
  }
};

export const setLangPref = (lang) => {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {}
};
