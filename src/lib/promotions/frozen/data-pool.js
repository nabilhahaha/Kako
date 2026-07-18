/* AUTO-GENERATED — VERBATIM EXTRACT FROM THE REFERENCE IMPLEMENTATION. DO NOT EDIT.
 * Source: roshen_settlement_platform.html lines 2726–2849
 * Block sha256: a3c883051873acd3ad64f32a17d5ca1752f00f2bd68e6b32d9b2d2ff039203ff
 * Regenerate: node scripts/extract-frozen-promotions.mjs
 * Verify:     node scripts/extract-frozen-promotions.mjs --check
 */
/* eslint-disable */
// @ts-nocheck
import { engine } from './engine-bootstrap.js';
import { Store } from './store.js';
/* ===== BEGIN VERBATIM (extracted — do not modify) ===== */
/* ============ DATA POOL — cumulative uploaded sales periods ============ */
/* ===========================
   DATA POOL (ADDITIVE) — cumulative store of uploaded sales periods.
   Raw exports uploaded under Administration → Data Upload are normalized
   into invoice batches and persisted in the browser (IndexedDB, with a
   localStorage fallback). The Promo Simulator reads the combined pool, so
   promotions defined ahead of time start calculating automatically the
   moment the matching period's sales file is added. Read-only alongside
   the frozen settlement engines — audited campaign figures are untouched.
   =========================== */
/* Snapshot of the bootstrap (audited) campaign bundles taken before any
   runtime registration or hiding. The simulation data pool reads from this
   snapshot so hiding a campaign from the UI never removes its invoices
   from the calculations that other promotions depend on. */
const AUDITED_SOURCES = engine.promotions.slice();

const DataStore = (() => {
  const DB_NAME = 'roshen_platform_datapool_v1', STORE = 'batches';
  const LS_KEY = Store.NS + 'datapool';
  let mem = [];            // [{id, name, addedAt, from, to, nInv, nRows, invoices:[…]}]
  let mode = 'memory';     // 'idb' | 'local' | 'memory'
  let version = 0;

  function idbOpen() {
    return new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('IndexedDB unavailable'));
      const rq = indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore(STORE, { keyPath: 'id' }); };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error || new Error('IndexedDB open failed'));
    });
  }
  function idbAll(db) {
    return new Promise((res, rej) => {
      const rq = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      rq.onsuccess = () => res(rq.result || []);
      rq.onerror = () => rej(rq.error);
    });
  }
  function idbPut(db, batch) {
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(batch);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
  function idbDel(db, id) {
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
  function persistLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(mem)); return true; }
    catch (e) { console.warn('data pool: localStorage persist failed', e); return false; }
  }

  async function init() {
    try {
      const db = await idbOpen();
      mem = await idbAll(db);
      db.close();
      mode = 'idb';
    } catch (e) {
      try { mem = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); mode = 'local'; }
      catch (e2) { mem = []; mode = 'memory'; }
    }
    mem.sort((a, b) => a.addedAt - b.addedAt);
    version++;
  }
  async function add(batch) {
    mem.push(batch);
    version++;
    if (mode === 'idb') {
      try { const db = await idbOpen(); await idbPut(db, batch); db.close(); return 'idb'; }
      catch (e) { console.warn('data pool: idb persist failed', e); mode = 'local'; }
    }
    if (mode === 'local') return persistLocal() ? 'local' : 'memory';
    return 'memory';
  }
  async function remove(id) {
    mem = mem.filter(b => b.id !== id);
    version++;
    if (mode === 'idb') {
      try { const db = await idbOpen(); await idbDel(db, id); db.close(); return; }
      catch (e) { console.warn('data pool: idb delete failed', e); mode = 'local'; }
    }
    if (mode === 'local') persistLocal();
  }
  return {
    init, add, remove,
    batches: () => mem.slice(),
    get version() { return version; },
    get mode() { return mode; },
  };
})();

/**
 * Normalize a RawParser.parse() result into platform-shaped invoice objects
 * for the simulation pool. Mirrors the invoice assembly of the frozen
 * buildPromoData (paid net, free value, CN flag) without promo tagging —
 * the simulator matches lines by product code and paid amount only.
 */
function invoicesFromParsed(parsed) {
  const invMap = new Map();
  parsed.lines.forEach(l => {
    let o = invMap.get(l.inv);
    if (!o) {
      o = { inv: l.inv, date: l.date, cust: l.cust, code: l.custCode, city: l.city, sales: l.rep,
        channel: l.channel, lines: [], net: 0, tax: 0, total: 0, freeval: 0, nlines: 0, isCN: l.isReturn };
      invMap.set(l.inv, o);
    }
    o.lines.push({ code: l.code, name: l.name, unit: l.unit, cases: l.cases, each: l.each,
      price: l.price, net: l.net, gross: l.gross, type: (l.net === 0 ? 'FREE' : 'PAID'), promo: false });
    o.nlines++;
    if (l.net > 0) o.net += l.net;
    if (l.net === 0) o.freeval += l.gross;
    o.total = o.net;
    if (l.isReturn) o.isCN = true;
  });
  return [...invMap.values()];
}

/* ===== END VERBATIM ===== */
export { AUDITED_SOURCES, DataStore, invoicesFromParsed };