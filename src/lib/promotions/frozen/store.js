/* AUTO-GENERATED — VERBATIM EXTRACT FROM THE REFERENCE IMPLEMENTATION. DO NOT EDIT.
 * Source: roshen_settlement_platform.html lines 2296–2302
 * Block sha256: c4231e0819902c89056b5a828013312eaf7fb0e36be40b925e3414737dce75ca
 * Regenerate: node scripts/extract-frozen-promotions.mjs
 * Verify:     node scripts/extract-frozen-promotions.mjs --check
 */
/* eslint-disable */
// @ts-nocheck
/* ===== BEGIN VERBATIM (extracted — do not modify) ===== */
const Store = (() => {
  const NS = 'roshen_platform_v2:';
  const get = (k, fb) => { try { const v = localStorage.getItem(NS + k); return v == null ? fb : JSON.parse(v); } catch (e) { return fb; } };
  const set = (k, v) => { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) {} };
  const del = (k) => { try { localStorage.removeItem(NS + k); } catch (e) {} };
  return { get, set, del, NS };
})();
/* ===== END VERBATIM ===== */
export { Store };