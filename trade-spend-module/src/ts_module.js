// ═════════════════════════════════════════════════════════════════════════════
// TRADE SPEND — native Dashboard module (window.TS)
// ═════════════════════════════════════════════════════════════════════════════
// Single global namespace. No Dashboard globals are created or modified.
// Business logic is a faithful port of the legacy public/trade_spend.html
// (which keeps running unchanged in parallel) with two approved changes:
//   1. SALES come from the Dashboard's loaded dataset (single source of truth)
//      instead of the legacy embedded blob / Excel upload / IndexedDB cache.
//   2. AUTH comes from the Dashboard identity + ts.* capabilities instead of
//      hardcoded emails. Until migration 002 is applied, a legacy-parity
//      grant table (same people, same rights) keeps behaviour identical.
// Cloud backend: the SAME Supabase project + `activities` table as legacy,
// through the Dashboard's already-authenticated client (CLOUD.sb).
// ═════════════════════════════════════════════════════════════════════════════
window.TS = (function () {
  'use strict';

  var TABS = ['log', 'new', 'analysis'];
  var ALL_CATEGORIES = 'ALL';

  var state = {
    tab: 'log',
    activities: [],
    loaded: false,
    loading: false,
    cloudError: '',
    search: '',
    statusFilter: '',
    editingId: null,      // activity id when editing, null when creating
    viewId: null,         // activity id open in the view modal
    formPhotos: [],       // execPhotos being edited (base64 list)
    formCreditNote: { image: '', filename: '' },
    formCats: [],         // selected category names, or ['ALL']
    formSkus: [],
    customTypes: [],      // user-added activity types (persisted inside activities)
    rt: null,
    pollTimer: null,
    reloading: false,
    salesIdx: null,       // Map acct -> [row indices] over the Dashboard dataset
    salesIdxSig: ''
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Small utilities
  // ───────────────────────────────────────────────────────────────────────────
  function esc(s) {
    if (typeof window.escapeHTML === 'function') return window.escapeHTML(String(s == null ? '' : s));
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function fmtSAR(v) {
    if (v == null || !isFinite(v)) return '—';
    return Math.round(v).toLocaleString('en-US') + ' SAR';
  }
  function fmtPct(v) { return (v == null || !isFinite(v)) ? '—' : (v * 100).toFixed(1) + '%'; }
  function fmtDT(s) { if (!s) return '—'; try { return new Date(s).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'; } catch (e) { return String(s); } }
  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function byId(id) { return document.getElementById(id); }
  function toast(msg, bad) {
    var el = byId('tsToast');
    if (!el) {
      el = document.createElement('div'); el.id = 'tsToast'; el.className = 'ts-toast'; document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.toggle('bad', !!bad);
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 3200);
  }
  function tokenColor(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // AUTH — Dashboard identity + ts.* capabilities
  // ───────────────────────────────────────────────────────────────────────────
  // Role defaults mirror trade-spend-module/migrations/002_ts_permissions.sql.
  var ROLE_CAPS = {
    super_admin: ['ts.view', 'ts.create', 'ts.edit', 'ts.delete', 'ts.export', 'ts.admin'],
    admin: ['ts.view', 'ts.create', 'ts.edit', 'ts.export'],
    regional_admin: ['ts.view', 'ts.export'],
    manager: ['ts.view', 'ts.export'],
    viewer: ['ts.view'],
    sales_rep: ['ts.view', 'ts.create', 'ts.edit'],
    supervisor: ['ts.view']
  };
  // Person-specific rights (e.g. who approves the Roshen / Relia / Final
  // stages) are NOT hardcoded here: they live in dash_users.overrides.ts,
  // managed by the Dashboard RBAC (seeded by migration 002).
  var auth = {
    email: '',
    role: '',
    caps: {},          // { 'ts.view': true, ... }
    resolved: false,
    resolving: null
  };

  function applyCapList(list, on) {
    (list || []).forEach(function (c) { if (on) auth.caps[c] = true; else delete auth.caps[c]; });
  }

  function resolveAuth() {
    if (auth.resolving) return auth.resolving;
    auth.resolving = (async function () {
      auth.caps = {};
      try {
        if (typeof CLOUD !== 'undefined' && CLOUD.active && CLOUD.sb) {
          var sess = await CLOUD.sb.auth.getSession();
          var user = sess && sess.data && sess.data.session ? sess.data.session.user : null;
          auth.email = ((user && user.email) || '').toLowerCase();
          auth.role = (CLOUD.role || '').toLowerCase();
          applyCapList(ROLE_CAPS[auth.role] || [], true);
          // DB-backed per-user overrides (namespaced): dash_users.overrides.ts
          // — the single authorization source for person-specific rights.
          try {
            var r = await CLOUD.sb.from('dash_users').select('overrides').eq('email', auth.email).maybeSingle();
            var ov = r && r.data && r.data.overrides && r.data.overrides.ts;
            if (ov) {
              applyCapList(ov.grant, true);
              applyCapList(ov.revoke, false);
            }
          } catch (e) {
            console.warn('TS overrides unavailable — using role defaults only', e);
          }
        } else if (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) {
          // Legacy (file://) Dashboard session: local admin can look around,
          // but activities live in the cloud — data stays read-only offline.
          auth.email = '';
          auth.role = 'local';
          applyCapList(['ts.view'], true);
        }
      } catch (e) { console.error('TS auth resolve failed', e); }
      auth.resolved = true;
      return auth;
    })();
    return auth.resolving;
  }

  function can(cap) { return !!auth.caps[cap]; }
  function isSystemAdmin() { return can('ts.admin'); }
  function canFinalApprove() { return can('ts.approve.final'); }
  function currentUserEmail() { return auth.email; }

  // ───────────────────────────────────────────────────────────────────────────
  // Activity model helpers — faithful ports from the legacy app
  // ───────────────────────────────────────────────────────────────────────────
  function getCats(a) {
    if (a && Array.isArray(a.categories) && a.categories.length) return a.categories.slice();
    if (a && a.category) return [a.category];
    return [];
  }
  function isAllCats(cats) { return cats.length === 1 && cats[0] === ALL_CATEGORIES; }
  function catLabel(a) {
    var cats = getCats(a);
    if (!cats.length) return '—';
    if (isAllCats(cats)) return '⭐ All Categories';
    return cats.join(', ');
  }
  function catsOverlap(a, b) {
    if (isAllCats(a) || isAllCats(b)) return true;
    return a.some(function (c) { return b.indexOf(c) >= 0; });
  }
  function getClaim(a) { return a && a.claimReceived === 'Yes' ? 'Yes' : 'No'; }
  function getFinal(a) { return (a && (a.finalApproved === 'Yes' || a.finalApproved === 'Rejected')) ? a.finalApproved : 'No'; }
  function finalState(a) { return getFinal(a); }
  function isCreatorOf(a) { return !!a.createdBy && a.createdBy.toLowerCase() === currentUserEmail(); }

  function computeOverall(a) {
    if (a.reliaStatus === 'Rejected' || a.roshenStatus === 'Rejected') return 'Rejected';
    if (a.reliaStatus === 'Approved' && a.roshenStatus === 'Approved') return (a.execStatus === 'Fully Executed' ? 'Completed' : 'Approved');
    if (a.reliaStatus === 'Pending Approval' || a.roshenStatus === 'Pending Approval') return 'Pending Approval';
    return 'In Progress';
  }

  // Row lock rules — identical to legacy.
  function canEditRow(a) {
    if (!can('ts.edit')) return false;
    if (canFinalApprove()) return false;
    var fs = finalState(a);
    if (fs === 'Yes') return isSystemAdmin();
    if (fs === 'Rejected') return isSystemAdmin() || isCreatorOf(a);
    return true;
  }
  function canDeleteRow(a) {
    if (!can('ts.delete')) return false;
    if (canFinalApprove()) return false;
    if (finalState(a) === 'Yes') return isSystemAdmin();
    return true;
  }

  function generateActivityId() {
    var year = new Date().getFullYear();
    var maxNum = 0;
    state.activities.forEach(function (a) {
      if (a.id && a.id.indexOf('TS-' + year + '-') === 0) {
        var m = a.id.match(/TS-\d+-(\d+)/);
        if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
      }
    });
    return 'TS-' + year + '-' + String(maxNum + 1).padStart(3, '0');
  }

  function stripPhotos(a) {
    var c = Object.assign({}, a);
    delete c.execPhotos;
    delete c.creditNoteImage;
    return c;
  }

  function activityToRow(a) {
    var cats = getCats(a);
    return {
      activity_code: a.id,
      customer: a.custName || '',
      customer_code: a.custCode || '',
      distributor: a.distributor || '',
      category: (isAllCats(cats) ? ALL_CATEGORIES : (cats[0] || '')),
      categories: cats,
      sku: a.skus || [],
      activity_type: a.actType || '',
      start_date: a.activityDate || a.startDate || null,
      end_date: a.postEndDate || a.endDate || null,
      amount: (a.totalAmount != null ? a.totalAmount : null),
      uplift: (a.uplift != null ? a.uplift : null),
      roi: (a.roi != null ? a.roi : null),
      verdict: a.verdict || '',
      status: a.overallStatus || '',
      claim_received: getClaim(a),
      claim_ref: a.claimRef || '',
      roshen_status: a.roshenStatus || '',
      relia_status: a.reliaStatus || '',
      photos: { execPhotos: a.execPhotos || [], creditNoteImage: a.creditNoteImage || '', creditNoteFilename: a.creditNoteFilename || '' },
      notes: a.notes || '',
      final_approved: finalState(a),
      final_rejected_by: a.finalRejectedBy || null,
      final_rejected_at: a.finalRejectedAt || null,
      final_reject_reason: a.finalRejectReason || null,
      final_approved_by: a.finalApprovedBy || null,
      final_approved_at: a.finalApprovedAt || null,
      data: stripPhotos(a),
      created_by: a.createdBy || currentUserEmail(),
      updated_by: currentUserEmail(),
      created_at: a.createdAt || new Date().toISOString(),
      updated_at: a.updatedAt || new Date().toISOString()
    };
  }

  function rowToActivity(row) {
    var a = Object.assign({}, row.data || {});
    var p = row.photos || {};
    a.execPhotos = p.execPhotos || [];
    a.creditNoteImage = p.creditNoteImage || '';
    if (!a.creditNoteFilename && p.creditNoteFilename) a.creditNoteFilename = p.creditNoteFilename;
    a.id = a.id || row.activity_code;
    if (!a.createdBy && row.created_by) a.createdBy = row.created_by;
    if (row.updated_by) a.updatedBy = row.updated_by;
    if (!a.finalApproved && row.final_approved) a.finalApproved = row.final_approved;
    if (!a.finalRejectedBy && row.final_rejected_by) a.finalRejectedBy = row.final_rejected_by;
    if (!a.finalRejectedAt && row.final_rejected_at) a.finalRejectedAt = row.final_rejected_at;
    if (!a.finalRejectReason && row.final_reject_reason) a.finalRejectReason = row.final_reject_reason;
    if (!a.finalApprovedBy && row.final_approved_by) a.finalApprovedBy = row.final_approved_by;
    if (!a.finalApprovedAt && row.final_approved_at) a.finalApprovedAt = row.final_approved_at;
    return a;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SALES ADAPTER — reads the Dashboard's loaded dataset (single source of truth)
  // Replaces the legacy embedded blob / Excel upload / IndexedDB cache.
  // ───────────────────────────────────────────────────────────────────────────
  function datasetReady() {
    return typeof D !== 'undefined' && D && D.s && typeof CUSTOMERS !== 'undefined' && CUSTOMERS.length > 0;
  }

  function salesIndex() {
    if (!datasetReady()) return null;
    var sig = CUSTOMERS.length + ':' + D.s.length;
    if (state.salesIdx && state.salesIdxSig === sig) return state.salesIdx;
    // acct -> Set(customer ids); then customer id -> rows in one pass.
    var idByAcct = new Map();
    for (var c = 0; c < CUSTOMERS.length; c++) {
      var acct = CUSTOMERS[c].acct;
      if (!idByAcct.has(acct)) idByAcct.set(acct, []);
      idByAcct.get(acct).push(CUSTOMERS[c].id);
    }
    var rowsByCust = new Map();
    for (var i = 0; i < D.s.length; i++) {
      var cu = D.cu[i];
      var arr = rowsByCust.get(cu);
      if (!arr) { arr = []; rowsByCust.set(cu, arr); }
      arr.push(i);
    }
    state.salesIdx = { idByAcct: idByAcct, rowsByCust: rowsByCust };
    state.salesIdxSig = sig;
    return state.salesIdx;
  }

  function resolveCatIdxSet(cats) {
    if (!cats || !cats.length || isAllCats(cats)) return null; // null = all
    var set = new Set();
    cats.forEach(function (name) {
      var i = DIMS.categories.indexOf(name);
      if (i >= 0) set.add(i);
    });
    return set;
  }

  // Same contract as the legacy calcSalesForRange, but date strings in/out and
  // the Dashboard dataset underneath. Handles multi-entry accounts exactly like
  // legacy (a code can map to several customer records with name variants).
  function calcSalesForRange(custCode, cats, skus, startDateStr, endDateStr) {
    var idx = salesIndex();
    if (!idx) return { amount: 0, cases: 0 };
    var ids = idx.idByAcct.get(custCode) || [];
    if (!ids.length) return { amount: 0, cases: 0 };
    var from = dateToInt(startDateStr), to = dateToInt(endDateStr);
    var catSet = resolveCatIdxSet(cats);
    var skuIdSet = null;
    if (skus && skus.length) {
      skuIdSet = new Set();
      SKUS.forEach(function (s) { if (skus.indexOf(s.d) >= 0) skuIdSet.add(s.id); });
    }
    var amount = 0, cases = 0;
    for (var k = 0; k < ids.length; k++) {
      var rows = idx.rowsByCust.get(ids[k]) || [];
      for (var j = 0; j < rows.length; j++) {
        var i = rows[j];
        var d = D.d[i];
        if (d < from || d > to) continue;
        if (skuIdSet && !skuIdSet.has(D.sk[i])) continue;
        if (catSet) {
          var sku = SKU_BY_ID[D.sk[i]];
          if (!sku || !catSet.has(sku.c)) continue;
        }
        amount += D.s[i];
        cases += QC(i);
      }
    }
    return { amount: amount, cases: cases };
  }

  function salesCustomers() {
    if (!datasetReady()) return [];
    var seen = new Map();
    CUSTOMERS.forEach(function (c) { if (!seen.has(c.acct)) seen.set(c.acct, c.name || c.n || ''); });
    var out = [];
    seen.forEach(function (name, acct) { out.push({ acct: acct, name: name }); });
    out.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    return out;
  }
  function salesCategories() { return datasetReady() ? DIMS.categories.slice() : []; }
  function skusForCats(cats) {
    if (!datasetReady()) return [];
    var catSet = resolveCatIdxSet(cats);
    var out = [];
    SKUS.forEach(function (s) { if (!catSet || catSet.has(s.c)) out.push(s.d); });
    out.sort();
    return out;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CALC — periods, uplift, ROI, verdict (verbatim legacy logic)
  // ───────────────────────────────────────────────────────────────────────────
  function getRentalDurationMonths(actType) {
    if (!actType) return null;
    if (actType.indexOf('Rent 1 Month') >= 0) return 1;
    if (actType.indexOf('Rent 3 Months') >= 0) return 3;
    if (actType.indexOf('Rent 6 Months') >= 0) return 6;
    if (actType.indexOf('Rent 1 Year') >= 0) return 12;
    return null;
  }

  function getPeriodForActivity(actType, activityDateStr, currentId, custCode, cats) {
    var months = getRentalDurationMonths(actType);
    var activityDate = new Date(activityDateStr);

    var preEndDate = new Date(activityDate);
    preEndDate.setDate(preEndDate.getDate() - 1);

    var preStartDate = new Date(activityDate);
    preStartDate.setMonth(preStartDate.getMonth() - (months || 3));

    var maxPostEndDate = new Date(activityDate);
    maxPostEndDate.setMonth(maxPostEndDate.getMonth() + (months || 3));
    maxPostEndDate.setDate(maxPostEndDate.getDate() - 1);

    var truncatedBy = null;
    var actualPostEndDate = maxPostEndDate;

    var futureActivities = state.activities
      .filter(function (a) {
        return a.id !== currentId &&
          a.custCode === custCode &&
          catsOverlap(getCats(a), cats) &&
          a.activityDate &&
          new Date(a.activityDate) > activityDate;
      })
      .sort(function (a, b) { return new Date(a.activityDate) - new Date(b.activityDate); });

    if (futureActivities.length > 0) {
      var next = futureActivities[0];
      var nextDate = new Date(next.activityDate);
      if (nextDate < maxPostEndDate) {
        actualPostEndDate = new Date(nextDate);
        actualPostEndDate.setDate(actualPostEndDate.getDate() - 1);
        truncatedBy = next.id;
      }
    }

    var fmt = function (d) { return d.toISOString().slice(0, 10); };
    var dayDiff = function (a, b) { return Math.round((a - b) / (1000 * 60 * 60 * 24)) + 1; };

    return {
      preStartDateStr: fmt(preStartDate),
      preEndDateStr: fmt(preEndDate),
      postStartDateStr: activityDateStr,
      postEndDateStr: fmt(actualPostEndDate),
      postDays: dayDiff(actualPostEndDate, activityDate),
      truncatedBy: truncatedBy,
      rentalMonths: months
    };
  }

  // pre/post → incremental, uplift, roi, verdict. Thresholds identical to legacy.
  function computePerf(custCode, cats, skus, actType, activityDateStr, currentId, totalAmount) {
    var periods = getPeriodForActivity(actType, activityDateStr, currentId, custCode, cats);
    var pre = calcSalesForRange(custCode, cats, skus, periods.preStartDateStr, periods.preEndDateStr);
    var post = calcSalesForRange(custCode, cats, skus, periods.postStartDateStr, periods.postEndDateStr);
    var incremental = post.amount - pre.amount;
    var uplift = pre.amount > 0 ? (post.amount - pre.amount) / pre.amount : (post.amount > 0 ? null : null);
    var upliftNew = pre.amount <= 0 && post.amount > 0;
    var roi = totalAmount > 0 ? (incremental - totalAmount) / totalAmount : null;
    var verdict = 'Pending';
    if (roi != null) verdict = roi >= 0.2 ? 'Successful' : (roi >= 0 ? 'Break-even' : 'Loss');
    return {
      periods: periods,
      preAmount: pre.amount, preCases: pre.cases,
      postAmount: post.amount, postCases: post.cases,
      incremental: incremental, uplift: uplift, upliftNew: upliftNew,
      roi: roi, verdict: verdict
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DATA — activities CRUD + realtime + polling on the shared cloud client
  // ───────────────────────────────────────────────────────────────────────────
  function sbc() {
    return (typeof CLOUD !== 'undefined' && CLOUD.active && CLOUD.sb) ? CLOUD.sb : null;
  }

  async function loadActivities() {
    var sb = sbc();
    if (!sb) { state.cloudError = 'offline'; state.loaded = true; return; }
    state.loading = true;
    try {
      var res = await sb.from('activities').select('*').order('created_at', { ascending: true });
      if (res.error) throw res.error;
      state.activities = (res.data || []).map(rowToActivity);
      // custom activity types persisted on activities themselves
      var known = {};
      state.activities.forEach(function (a) { if (a.actType) known[a.actType] = true; });
      state.customTypes = Object.keys(known).filter(function (t) { return STD_TYPES.indexOf(t) < 0; });
      state.cloudError = '';
    } catch (e) {
      state.cloudError = (e && e.message) || String(e);
      console.error('TS load failed', e);
    }
    state.loading = false;
    state.loaded = true;
  }

  var _reloadTimer = null;
  async function reloadNow() {
    if (!sbc() || state.reloading) return;
    state.reloading = true;
    try {
      await loadActivities();
      if (CURRENT_MODE === 'tradespend') renderCurrent();
    } catch (e) { console.warn('TS reload failed', e); }
    state.reloading = false;
  }
  function scheduleReload() { clearTimeout(_reloadTimer); _reloadTimer = setTimeout(reloadNow, 400); }

  function subscribeRealtime() {
    var sb = sbc();
    if (!sb || state.rt) return;
    try {
      state.rt = sb.channel('ts-dash-activities')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, function () { scheduleReload(); })
        .subscribe(function (status) {
          if (status === 'SUBSCRIBED') { reloadNow(); }
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            try { sb.removeChannel(state.rt); } catch (e) {}
            state.rt = null;
            setTimeout(subscribeRealtime, 5000);
          }
        });
    } catch (e) { console.warn('TS realtime unavailable', e); }
  }

  function startPolling() {
    if (state.pollTimer) return;
    state.pollTimer = setInterval(function () {
      if (!document.hidden && CURRENT_MODE === 'tradespend') reloadNow();
    }, 15000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && CURRENT_MODE === 'tradespend') reloadNow(); });
    window.addEventListener('online', function () { reloadNow(); });
  }

  async function persistActivity(a) {
    var sb = sbc();
    if (!sb) { toast('Cloud connection required to save.', true); return false; }
    var row = activityToRow(a);
    var res = await sb.from('activities').upsert(row, { onConflict: 'activity_code' });
    if (res.error) { toast('Cloud save failed: ' + res.error.message, true); return false; }
    return true;
  }

  async function pushCloud(id, a, cols) {
    var sb = sbc(); if (!sb) return false;
    var payload = Object.assign({}, cols, { data: stripPhotos(a), status: a.overallStatus, updated_by: a.updatedBy, updated_at: a.updatedAt });
    var res = await sb.from('activities').update(payload).eq('activity_code', id);
    if (res.error) { toast('Cloud save failed: ' + res.error.message, true); return false; }
    return true;
  }

  async function deleteActivity(id) {
    var a = findAct(id); if (!a) return;
    if (!canDeleteRow(a)) { toast('You cannot delete this activity.', true); return; }
    if (!confirm('Delete activity ' + id + '? This cannot be undone.')) return;
    var sb = sbc(); if (!sb) { toast('Cloud connection required.', true); return; }
    var res = await sb.from('activities').delete().eq('activity_code', id);
    if (res.error) { toast('Delete failed: ' + res.error.message, true); return; }
    state.activities = state.activities.filter(function (x) { return x.id !== id; });
    toast('Activity ' + id + ' deleted.');
    renderCurrent();
  }

  function findAct(id) { return state.activities.find(function (x) { return x.id === id; }); }

  // ───────────────────────────────────────────────────────────────────────────
  // APPROVALS — same rules, ts.* capabilities instead of hardcoded emails
  // ───────────────────────────────────────────────────────────────────────────
  async function roshenDecision(id, decision) {
    if (!can('ts.approve.roshen')) { toast('Only the Roshen approver can decide Roshen approval.', true); return; }
    var a = findAct(id); if (!a) return;
    if (a.roshenStatus !== 'Pending Approval') { toast('Roshen decision was already made.', true); return; }
    a.roshenStatus = decision;
    if (decision === 'Approved') { a.roshenApprovedBy = currentUserEmail(); a.roshenApprovedAt = new Date().toISOString(); }
    else { a.roshenRejectedBy = currentUserEmail(); a.roshenRejectedAt = new Date().toISOString(); }
    a.overallStatus = computeOverall(a); a.updatedBy = currentUserEmail(); a.updatedAt = new Date().toISOString();
    renderCurrent();
    await pushCloud(id, a, { roshen_status: decision });
    toast('Roshen: ' + decision + ' — ' + id);
  }

  async function reliaDecision(id, decision) {
    if (!can('ts.approve.relia')) { toast('Only the Relia approver can decide Relia approval.', true); return; }
    var a = findAct(id); if (!a) return;
    if (a.reliaStatus !== 'Pending Approval') { toast('Relia decision was already made.', true); return; }
    a.reliaStatus = decision;
    if (decision === 'Approved') { a.reliaApprovedBy = currentUserEmail(); a.reliaApprovedAt = new Date().toISOString(); }
    else { a.reliaRejectedBy = currentUserEmail(); a.reliaRejectedAt = new Date().toISOString(); }
    a.overallStatus = computeOverall(a); a.updatedBy = currentUserEmail(); a.updatedAt = new Date().toISOString();
    renderCurrent();
    await pushCloud(id, a, { relia_status: decision });
    toast('Relia: ' + decision + ' — ' + id);
  }

  async function finalApprove(id) {
    if (!canFinalApprove()) { toast('Only the Final Approver can perform Final Approval.', true); return; }
    var a = findAct(id); if (!a) return;
    if (!(a.roshenStatus === 'Approved' && a.reliaStatus === 'Approved')) { toast('Both Roshen and Relia must be Approved first.', true); return; }
    if (getFinal(a) === 'Yes') return;
    a.finalApproved = 'Yes'; a.finalApprovedBy = currentUserEmail(); a.finalApprovedAt = new Date().toISOString();
    a.updatedBy = currentUserEmail(); a.updatedAt = a.finalApprovedAt;
    renderCurrent();
    var sb = sbc();
    if (sb) {
      var res = await sb.from('activities').update({ final_approved: 'Yes', final_approved_by: a.finalApprovedBy, final_approved_at: a.finalApprovedAt, data: stripPhotos(a), updated_by: a.updatedBy, updated_at: a.updatedAt }).eq('activity_code', id);
      if (res.error) { toast('Cloud save failed: ' + res.error.message, true); return; }
    }
    if (state.viewId === id) openView(id);
    toast('Final Approval recorded — ' + id);
  }

  async function finalReject(id) {
    if (!canFinalApprove()) { toast('Only the Final Approver can perform this action.', true); return; }
    var a = findAct(id); if (!a) return;
    if (!(a.roshenStatus === 'Approved' && a.reliaStatus === 'Approved')) { toast('Requires Roshen and Relia both Approved.', true); return; }
    if (finalState(a) !== 'No') return;
    var reason = prompt('Enter rejection reason (required):');
    if (reason === null) return;
    reason = String(reason).trim();
    if (!reason) { toast('A rejection reason is required.', true); return; }
    a.finalApproved = 'Rejected'; a.finalRejectedBy = currentUserEmail(); a.finalRejectedAt = new Date().toISOString(); a.finalRejectReason = reason;
    a.updatedBy = currentUserEmail(); a.updatedAt = a.finalRejectedAt;
    renderCurrent();
    var sb = sbc();
    if (sb) {
      var res = await sb.from('activities').update({ final_approved: 'Rejected', final_rejected_by: a.finalRejectedBy, final_rejected_at: a.finalRejectedAt, final_reject_reason: reason, data: stripPhotos(a), updated_by: a.updatedBy, updated_at: a.updatedAt }).eq('activity_code', id);
      if (res.error) { toast('Cloud save failed: ' + res.error.message, true); return; }
    }
    if (state.viewId === id) openView(id);
    toast('Activity rejected and returned to the creator — ' + id);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // UI — Log
  // ───────────────────────────────────────────────────────────────────────────
  var STD_TYPES = [
    'Floor Display', 'Floor Display - Rent 1 Month', 'Floor Display - Rent 3 Months', 'Floor Display - Rent 6 Months', 'Floor Display - Rent 1 Year',
    'Gondola', 'Gondola - Rent 1 Month', 'Gondola - Rent 3 Months', 'Gondola - Rent 6 Months', 'Gondola - Rent 1 Year',
    'Shelf', 'Digital Promo'
  ];

  function statusBadge(s) {
    var map = {
      'Completed': ['var(--green)', 'var(--green-bg)'],
      'Approved': ['var(--green)', 'var(--green-bg)'],
      'Pending Approval': ['var(--amber)', 'var(--amber-bg)'],
      'Rejected': ['var(--red)', 'var(--red-bg)'],
      'In Progress': ['var(--text-secondary)', 'rgba(143,163,189,0.12)']
    };
    var c = map[s] || map['In Progress'];
    return '<span class="ts-badge" style="color:' + c[0] + ';background:' + c[1] + ';">' + esc(s || '—') + '</span>';
  }
  function verdictBadge(v) {
    var map = { 'Successful': ['var(--green)', 'var(--green-bg)'], 'Break-even': ['var(--amber)', 'var(--amber-bg)'], 'Loss': ['var(--red)', 'var(--red-bg)'], 'Pending': ['var(--text-secondary)', 'rgba(143,163,189,0.12)'] };
    var c = map[v] || map['Pending'];
    return '<span class="ts-badge" style="color:' + c[0] + ';background:' + c[1] + ';">' + esc(v || 'Pending') + '</span>';
  }
  function apprPill(label, status, who) {
    var color = status === 'Approved' ? 'var(--green)' : (status === 'Rejected' ? 'var(--red)' : 'var(--amber)');
    var icon = status === 'Approved' ? '✅' : (status === 'Rejected' ? '❌' : '⏳');
    var tip = who ? (label + ': ' + status + ' — ' + who) : (label + ': ' + (status || 'Pending'));
    return '<span title="' + esc(tip) + '" style="display:inline-flex;align-items:center;gap:3px;font-weight:700;color:' + color + ';"><span style="color:var(--text-muted);font-weight:600;">' + label + '</span>' + icon + '</span>';
  }
  function approvalsCell(a) {
    var fs = finalState(a);
    var fstat = fs === 'Yes' ? 'Approved' : (fs === 'Rejected' ? 'Rejected' : 'Pending Approval');
    var fwho = fs === 'Yes' ? a.finalApprovedBy : (fs === 'Rejected' ? a.finalRejectedBy : '');
    return '<div style="display:flex;align-items:center;gap:8px;white-space:nowrap;font-size:11px;">' +
      apprPill('R', a.roshenStatus, a.roshenApprovedBy || a.roshenRejectedBy) +
      apprPill('Rl', a.reliaStatus, a.reliaApprovedBy || a.reliaRejectedBy) +
      apprPill('F', fstat, fwho) + '</div>';
  }

  function actionButtons(a) {
    var out = [];
    var b = function (fn, label, cls, disabled, title) {
      out.push('<button class="ts-act-btn ' + (cls || '') + '"' + (disabled ? ' disabled' : '') +
        (title ? ' title="' + esc(title) + '"' : '') + ' onclick="' + fn + '">' + label + '</button>');
    };
    b("TS.openView('" + a.id + "')", '👁 View', '');
    if (canEditRow(a)) b("TS.editActivity('" + a.id + "')", '✏️ Edit', '');
    if (can('ts.approve.roshen') && a.roshenStatus === 'Pending Approval') {
      b("TS.roshenDecision('" + a.id + "','Approved')", '✓ Roshen', 'ok');
      b("TS.roshenDecision('" + a.id + "','Rejected')", '✗ Roshen', 'bad');
    }
    if (can('ts.approve.relia') && a.reliaStatus === 'Pending Approval') {
      b("TS.reliaDecision('" + a.id + "','Approved')", '✓ Relia', 'ok');
      b("TS.reliaDecision('" + a.id + "','Rejected')", '✗ Relia', 'bad');
    }
    if (canFinalApprove() && finalState(a) === 'No') {
      var prereq = a.roshenStatus === 'Approved' && a.reliaStatus === 'Approved';
      b("TS.finalApprove('" + a.id + "')", '✓ Final', 'ok', !prereq, prereq ? '' : 'Requires Roshen + Relia approved');
      b("TS.finalReject('" + a.id + "')", '✗ Final', 'bad', !prereq, prereq ? '' : 'Requires Roshen + Relia approved');
    }
    if (canDeleteRow(a)) b("TS.deleteActivity('" + a.id + "')", '🗑', 'bad', false, 'Delete');
    return '<div class="ts-actions">' + out.join('') + '</div>';
  }

  function filteredActivities() {
    var q = state.search.toLowerCase();
    var sf = state.statusFilter;
    return state.activities.filter(function (a) {
      if (sf && (a.overallStatus || computeOverall(a)) !== sf && !(sf === 'Final Approved' && finalState(a) === 'Yes') && !(sf === 'Final Rejected' && finalState(a) === 'Rejected')) return false;
      if (!q) return true;
      var hay = [a.id, a.custCode, a.custName, a.distributor, catLabel(a), a.actType, a.overallStatus, a.verdict, getClaim(a), finalState(a)].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function renderKpis() {
    var acts = state.activities;
    var spend = 0, approved = 0, pending = 0, finalYes = 0;
    acts.forEach(function (a) {
      spend += num(a.totalAmount);
      var st = a.overallStatus || computeOverall(a);
      if (st === 'Approved' || st === 'Completed') approved++;
      if (st === 'Pending Approval') pending++;
      if (finalState(a) === 'Yes') finalYes++;
    });
    var set = function (id, v, sub) {
      var el = byId(id); if (el) el.textContent = v;
      if (sub) { var s = byId(id + 'Sub'); if (s) s.textContent = sub; }
    };
    set('tsKpiActivities', String(acts.length), state.cloudError === 'offline' ? 'Cloud sign-in required' : 'Live from cloud');
    set('tsKpiSpend', acts.length ? Math.round(spend).toLocaleString('en-US') : '—', 'Total committed');
    set('tsKpiApproved', String(approved), finalYes + ' final-approved');
    set('tsKpiPending', String(pending), 'Awaiting decision');
  }

  function renderLog() {
    var host = byId('tsLogHost');
    if (!host) return;
    renderKpis();
    if (!state.loaded || state.loading) {
      host.innerHTML = '<div class="ts-empty"><div class="ts-empty-icon">⏳</div><h3>Loading activities…</h3></div>';
      return;
    }
    if (state.cloudError === 'offline') {
      host.innerHTML = '<div class="ts-empty"><div class="ts-empty-icon">☁️</div><h3>Cloud sign-in required</h3><p>Trade Spend activities live in the shared cloud workspace. Open the Dashboard from its cloud URL and sign in to manage activities.</p></div>';
      return;
    }
    if (state.cloudError) {
      host.innerHTML = '<div class="ts-empty"><div class="ts-empty-icon">⚠️</div><h3>Could not load activities</h3><p>' + esc(state.cloudError) + '</p><button class="btn" onclick="TS.reload()">Retry</button></div>';
      return;
    }
    var acts = filteredActivities();
    if (!acts.length) {
      host.innerHTML = '<div class="ts-empty"><div class="ts-empty-icon">📋</div><h3>' + (state.activities.length ? 'No activities match the current filter' : 'No activities yet') + '</h3>' +
        (can('ts.create') ? '<p>Create the first activity from the New Activity tab.</p>' : '') + '</div>';
      return;
    }
    var rows = acts.map(function (a) {
      var st = a.overallStatus || computeOverall(a);
      var period = (a.activityDate || '—') + ' → ' + (a.postEndDate || '—');
      var lock = finalState(a) === 'Yes' ? ' 🔒' : '';
      return '<tr>' +
        '<td style="font-weight:700;white-space:nowrap;">' + esc(a.id) + lock + '</td>' +
        '<td><div style="font-weight:600;">' + esc(a.custName || '—') + '</div><div style="font-size:10px;color:var(--text-muted);">' + esc(a.custCode || '') + '</div></td>' +
        '<td>' + esc(catLabel(a)) + '</td>' +
        '<td>' + esc(a.actType || '—') + '</td>' +
        '<td style="font-size:11px;white-space:nowrap;">' + esc(period) + '</td>' +
        '<td style="text-align:right;font-weight:700;white-space:nowrap;">' + (a.totalAmount != null ? Math.round(a.totalAmount).toLocaleString('en-US') : '—') + '</td>' +
        '<td>' + fmtPct(a.uplift) + '</td>' +
        '<td>' + fmtPct(a.roi) + '</td>' +
        '<td>' + verdictBadge(a.verdict) + '</td>' +
        '<td>' + esc(getClaim(a)) + '</td>' +
        '<td>' + approvalsCell(a) + '</td>' +
        '<td>' + statusBadge(st) + '</td>' +
        '<td>' + actionButtons(a) + '</td>' +
        '</tr>';
    }).join('');
    host.innerHTML =
      '<div style="overflow-x:auto;">' +
      '<table class="data-table ts-log-table" style="width:100%;">' +
      '<thead><tr><th>Code</th><th>Customer</th><th>Category</th><th>Type</th><th>Period</th><th>Amount (SAR)</th><th>Uplift</th><th>ROI</th><th>Verdict</th><th>Claim</th><th>Approvals</th><th>Status</th><th>Actions</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  // ───────────────────────────────────────────────────────────────────────────
  // UI — View modal
  // ───────────────────────────────────────────────────────────────────────────
  function timelineRow(icon, label, who, when) {
    return '<div class="ts-tl-row"><span class="ts-tl-ico">' + icon + '</span><div><div class="ts-tl-label">' + esc(label) + '</div><div class="ts-tl-meta">' + esc(who || '—') + ' · ' + fmtDT(when) + '</div></div></div>';
  }

  function openView(id) {
    var a = findAct(id); if (!a) return;
    state.viewId = id;
    var fs = finalState(a);
    var perfRows =
      '<tr><td>Sales Before</td><td>' + fmtSAR(a.preAmount) + '</td><td>' + (a.preCases != null ? Math.round(a.preCases).toLocaleString() + ' cases' : '—') + '</td></tr>' +
      '<tr><td>Sales After</td><td>' + fmtSAR(a.postAmount) + '</td><td>' + (a.postCases != null ? Math.round(a.postCases).toLocaleString() + ' cases' : '—') + '</td></tr>' +
      '<tr><td>Incremental</td><td>' + fmtSAR(a.incremental) + '</td><td></td></tr>' +
      '<tr><td>Uplift</td><td>' + fmtPct(a.uplift) + '</td><td></td></tr>' +
      '<tr><td>ROI</td><td>' + fmtPct(a.roi) + '</td><td>' + verdictBadge(a.verdict) + '</td></tr>';
    var photos = (a.execPhotos || []).map(function (p, i) {
      return '<img src="' + p + '" alt="Execution photo ' + (i + 1) + '" class="ts-photo" onclick="TS.zoomPhoto(' + i + ')">';
    }).join('');
    var tl = [
      timelineRow('📝', 'Created', a.createdBy, a.createdAt),
      timelineRow(a.roshenStatus === 'Approved' ? '🟢' : (a.roshenStatus === 'Rejected' ? '🔴' : '🟡'), 'Roshen — ' + (a.roshenStatus || 'Pending'), a.roshenApprovedBy || a.roshenRejectedBy, a.roshenApprovedAt || a.roshenRejectedAt),
      timelineRow(a.reliaStatus === 'Approved' ? '🟢' : (a.reliaStatus === 'Rejected' ? '🔴' : '🟡'), 'Relia — ' + (a.reliaStatus || 'Pending'), a.reliaApprovedBy || a.reliaRejectedBy, a.reliaApprovedAt || a.reliaRejectedAt),
      timelineRow(fs === 'Yes' ? '🟢' : (fs === 'Rejected' ? '🔴' : '🟡'), 'Final — ' + (fs === 'Yes' ? 'Approved' : (fs === 'Rejected' ? 'Rejected' : 'Pending')), fs === 'Yes' ? a.finalApprovedBy : a.finalRejectedBy, fs === 'Yes' ? a.finalApprovedAt : a.finalRejectedAt)
    ].join('');
    var finalBtns = '';
    if (canFinalApprove() && fs === 'No') {
      var prereq = a.roshenStatus === 'Approved' && a.reliaStatus === 'Approved';
      finalBtns = '<div style="display:flex;gap:10px;margin-top:14px;">' +
        '<button class="btn btn-primary" ' + (prereq ? '' : 'disabled title="Requires Roshen + Relia approved"') + ' onclick="TS.finalApprove(\'' + a.id + '\')">✓ Final Approve</button>' +
        '<button class="btn" ' + (prereq ? '' : 'disabled') + ' onclick="TS.finalReject(\'' + a.id + '\')">✗ Final Reject</button></div>';
    }
    var body =
      '<div class="ts-view-grid">' +
      '<div><div class="ts-view-k">Customer</div><div class="ts-view-v">' + esc(a.custName || '—') + ' <span style="color:var(--text-muted);font-size:11px;">' + esc(a.custCode || '') + '</span></div></div>' +
      '<div><div class="ts-view-k">Distributor</div><div class="ts-view-v">' + esc(a.distributor || '—') + '</div></div>' +
      '<div><div class="ts-view-k">Category</div><div class="ts-view-v">' + esc(catLabel(a)) + '</div></div>' +
      '<div><div class="ts-view-k">Activity Type</div><div class="ts-view-v">' + esc(a.actType || '—') + '</div></div>' +
      '<div><div class="ts-view-k">Activity Date</div><div class="ts-view-v">' + esc(a.activityDate || '—') + '</div></div>' +
      '<div><div class="ts-view-k">Post Period</div><div class="ts-view-v">' + esc((a.postStartDate || '—') + ' → ' + (a.postEndDate || '—')) + (a.truncatedBy ? ' <span title="Truncated by next activity" style="color:var(--amber);">✂ ' + esc(a.truncatedBy) + '</span>' : '') + '</div></div>' +
      '<div><div class="ts-view-k">Total Amount</div><div class="ts-view-v">' + fmtSAR(a.totalAmount) + '</div></div>' +
      '<div><div class="ts-view-k">Split</div><div class="ts-view-v">Relia ' + (a.reliaPct != null ? a.reliaPct : 50) + '% (' + fmtSAR(a.reliaAmount) + ') · Roshen ' + (a.roshenPct != null ? a.roshenPct : 50) + '% (' + fmtSAR(a.roshenAmount) + ')</div></div>' +
      '<div><div class="ts-view-k">Execution</div><div class="ts-view-v">' + esc(a.execStatus || '—') + '</div></div>' +
      '<div><div class="ts-view-k">Claim</div><div class="ts-view-v">' + esc(getClaim(a)) + (a.claimRef ? ' · ' + esc(a.claimRef) : '') + '</div></div>' +
      '</div>' +
      ((a.skus || []).length ? '<div class="ts-view-k" style="margin-top:12px;">SKUs</div><div style="font-size:12px;">' + esc((a.skus || []).join('; ')) + '</div>' : '') +
      '<div class="ts-view-k" style="margin-top:14px;">Performance</div>' +
      '<table class="data-table" style="width:100%;"><tbody>' + perfRows + '</tbody></table>' +
      (fs === 'Rejected' && a.finalRejectReason ? '<div class="ts-reject-box">Final rejection reason: ' + esc(a.finalRejectReason) + '</div>' : '') +
      '<div class="ts-view-k" style="margin-top:14px;">Timeline</div>' + tl +
      (photos ? '<div class="ts-view-k" style="margin-top:14px;">Execution Photos (' + a.execPhotos.length + ')</div><div class="ts-photo-grid">' + photos + '</div>' : '') +
      (a.notes ? '<div class="ts-view-k" style="margin-top:14px;">Notes</div><div style="font-size:12px;white-space:pre-wrap;">' + esc(a.notes) + '</div>' : '') +
      finalBtns;
    byId('tsModalTitle').textContent = a.id + ' — ' + (a.custName || '');
    byId('tsModalBody').innerHTML = body;
    byId('tsModal').classList.add('open');
  }
  function closeModal() { state.viewId = null; byId('tsModal').classList.remove('open'); }
  function zoomPhoto(i) {
    var a = findAct(state.viewId); if (!a || !a.execPhotos || !a.execPhotos[i]) return;
    var w = window.open('', '_blank');
    if (w) { w.document.write('<title>Photo</title><body style="margin:0;background:#111;display:grid;place-items:center;min-height:100vh;"><img src="' + a.execPhotos[i] + '" style="max-width:100%;max-height:100vh;">'); }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // UI — New / Edit form
  // ───────────────────────────────────────────────────────────────────────────
  function typeOptions(selected) {
    var html = '<option value="">— Select type —</option>' +
      '<optgroup label="Floor Display">' + STD_TYPES.slice(0, 5).map(function (t) { return '<option' + (t === selected ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</optgroup>' +
      '<optgroup label="Gondola">' + STD_TYPES.slice(5, 10).map(function (t) { return '<option' + (t === selected ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</optgroup>' +
      '<optgroup label="Other">' + STD_TYPES.slice(10).concat(state.customTypes).map(function (t) { return '<option' + (t === selected ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') +
      '<option value="__OTHER__">+ Other (custom)</option></optgroup>';
    return html;
  }

  function renderForm() {
    var host = byId('tsFormHost');
    if (!host) return;
    if (!can('ts.create') && !state.editingId) {
      host.innerHTML = '<div class="ts-empty"><div class="ts-empty-icon">🔒</div><h3>You do not have permission to create activities</h3>' + (canFinalApprove() ? '<p>Final approvers have read-only access.</p>' : '') + '</div>';
      return;
    }
    var a = state.editingId ? (findAct(state.editingId) || {}) : {};
    var custs = salesCustomers();
    var cats = salesCategories();
    var custOptions = custs.map(function (c) { return '<option value="' + esc(c.acct + ' — ' + c.name) + '"></option>'; }).join('');
    var pct = a.reliaPct != null ? a.reliaPct : 50;
    // Historical-value protection: when editing a record that already carries
    // saved performance figures, the user chooses between preserving them
    // (default — protects historical reporting) and recalculating from the
    // live Dashboard dataset.
    var hasStoredPerf = !!state.editingId && (a.preAmount != null || a.postAmount != null || a.uplift != null || a.roi != null);
    state.formCats = getCats(a);
    state.formSkus = (a.skus || []).slice();
    state.formPhotos = (a.execPhotos || []).slice();
    state.formCreditNote = { image: a.creditNoteImage || '', filename: a.creditNoteFilename || '' };
    var catChips = ['<label class="ts-chip' + (isAllCats(state.formCats) ? ' on' : '') + '"><input type="checkbox" ' + (isAllCats(state.formCats) ? 'checked' : '') + ' onchange="TS.toggleAllCats(this.checked)">⭐ All Categories</label>']
      .concat(cats.map(function (c) {
        var on = !isAllCats(state.formCats) && state.formCats.indexOf(c) >= 0;
        return '<label class="ts-chip' + (on ? ' on' : '') + '"><input type="checkbox" ' + (on ? 'checked' : '') + ' onchange="TS.toggleCat(' + JSON.stringify(c).replace(/"/g, '&quot;') + ', this.checked)">' + esc(c) + '</label>';
      })).join('');
    host.innerHTML =
      '<div class="card">' +
      '<div class="card-header"><div class="card-title"><span class="icon-bullet"></span> ' + (state.editingId ? 'Edit Activity — ' + esc(state.editingId) : 'New Activity') + '</div>' +
      (state.editingId ? '<button class="btn" onclick="TS.cancelEdit()">✕ Cancel Edit</button>' : '') + '</div>' +
      '<div class="ts-form-grid">' +
      '<div class="ts-field"><label>Customer *</label><input id="tsFCust" list="tsCustList" placeholder="Search account…" value="' + esc(a.custCode ? (a.custCode + ' — ' + (a.custName || '')) : '') + '" oninput="TS.recalc()"><datalist id="tsCustList">' + custOptions + '</datalist></div>' +
      '<div class="ts-field"><label>Distributor</label><input id="tsFDist" value="' + esc(a.distributor || '') + '" placeholder="e.g. Relia"></div>' +
      '<div class="ts-field"><label>Activity Type *</label><select id="tsFType" onchange="TS.onTypeChange()">' + typeOptions(a.actType) + '</select><input id="tsFTypeCustom" placeholder="Custom type…" style="display:none;margin-top:6px;" onchange="TS.recalc()"></div>' +
      '<div class="ts-field"><label>Activity Date *</label><input type="date" id="tsFDate" value="' + esc(a.activityDate || todayStr()) + '" onchange="TS.recalc()"></div>' +
      '<div class="ts-field"><label>Total Amount (SAR) *</label><input type="number" id="tsFAmount" min="0" step="0.01" value="' + (a.totalAmount != null ? a.totalAmount : '') + '" oninput="TS.onAmount()"></div>' +
      '<div class="ts-field"><label>Cost Split — Relia <span id="tsFSplitL">' + pct + '%</span> / Roshen <span id="tsFSplitR">' + (100 - pct) + '%</span></label>' +
      '<input type="range" id="tsFSplit" min="0" max="100" step="5" value="' + pct + '" oninput="TS.onSplit()">' +
      '<div class="ts-split-note"><span id="tsFSplitLA">Relia —</span><span id="tsFSplitRA">Roshen —</span></div></div>' +
      '<div class="ts-field"><label>Execution Status</label><select id="tsFExec">' +
      ['Not Executed', 'Partially Executed', 'Fully Executed'].map(function (s) { return '<option' + (s === (a.execStatus || 'Not Executed') ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
      '<div class="ts-field"><label>Claim Received</label><div style="display:flex;gap:8px;align-items:center;">' +
      '<select id="tsFClaim" style="max-width:110px;" onchange="TS.onClaim()">' + ['No', 'Yes'].map(function (s) { return '<option' + (s === getClaim(a) ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '<input id="tsFClaimRef" placeholder="Claim reference…" value="' + esc(a.claimRef || '') + '" style="' + (getClaim(a) === 'Yes' ? '' : 'display:none;') + '"></div></div>' +
      '<div class="ts-field"><label>Floor Displays #</label><input type="number" id="tsFNumFD" min="0" value="' + (a.numFloorDisplays != null ? a.numFloorDisplays : '') + '"></div>' +
      '<div class="ts-field"><label>Meters</label><input type="number" id="tsFMeters" min="0" step="0.1" value="' + (a.metersValue != null ? a.metersValue : '') + '"></div>' +
      '<div class="ts-field"><label>Branches #</label><input type="number" id="tsFNumBr" min="0" value="' + (a.numBranches != null ? a.numBranches : '') + '"></div>' +
      '</div>' +
      '<div class="ts-field" style="margin-top:14px;"><label>Categories *</label><div class="ts-chips">' + catChips + '</div></div>' +
      '<div class="ts-field" style="margin-top:10px;"><label>SKUs (optional — narrows sales attribution)</label><div id="tsSkuBox" class="ts-chips"></div></div>' +
      '<div class="ts-form-grid" style="margin-top:10px;">' +
      '<div class="ts-field"><label>Execution Photos</label><input type="file" id="tsFPhotos" accept="image/*" multiple onchange="TS.onPhotos(this)"><div id="tsFPhotoList" class="ts-photo-grid"></div></div>' +
      '<div class="ts-field"><label>Credit Note</label><input type="file" id="tsFCn" accept="image/*,.pdf" onchange="TS.onCreditNote(this)"><div id="tsFCnName" style="font-size:11px;color:var(--text-muted);margin-top:4px;">' + esc(a.creditNoteFilename || '') + '</div></div>' +
      '</div>' +
      '<div class="ts-field" style="margin-top:10px;"><label>Notes</label><textarea id="tsFNotes" rows="3" style="width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);padding:9px 12px;font:inherit;">' + esc(a.notes || '') + '</textarea></div>' +
      (hasStoredPerf ?
        '<div class="ts-field" style="margin-top:14px;"><label>Performance Values</label>' +
        '<select id="tsFPerfMode" onchange="TS.recalc()">' +
        '<option value="keep" selected>Keep original (as saved at approval time)</option>' +
        '<option value="recalc">Recalculate from latest sales data</option>' +
        '</select>' +
        '<div class="ts-split-note" style="margin-top:4px;"><span>“Keep original” freezes Sales Before/After, Uplift, ROI and Verdict for historical reporting. “Recalculate” refreshes them from the live Dashboard dataset.</span></div></div>'
        : '') +
      '<div class="ts-perf-box" id="tsPerfBox">' +
      '<div class="ts-perf-item"><div class="ts-view-k">Sales Before</div><div id="tsPerfPre" class="ts-perf-v">—</div></div>' +
      '<div class="ts-perf-item"><div class="ts-view-k">Sales After</div><div id="tsPerfPost" class="ts-perf-v">—</div></div>' +
      '<div class="ts-perf-item"><div class="ts-view-k">Uplift</div><div id="tsPerfUplift" class="ts-perf-v">—</div></div>' +
      '<div class="ts-perf-item"><div class="ts-view-k">ROI</div><div id="tsPerfRoi" class="ts-perf-v">—</div></div>' +
      '<div class="ts-perf-item"><div class="ts-view-k">Verdict</div><div id="tsPerfVerdict" class="ts-perf-v">—</div></div>' +
      '<div class="ts-perf-item"><div class="ts-view-k">Post Window</div><div id="tsPerfWin" class="ts-perf-v" style="font-size:11px;">—</div></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-top:16px;">' +
      '<button class="btn btn-primary" onclick="TS.saveActivity()">💾 ' + (state.editingId ? 'Save Changes' : 'Save Activity') + '</button>' +
      '<button class="btn" onclick="TS.resetForm()">Reset</button>' +
      '</div></div>';
    renderSkuBox();
    renderFormPhotos();
    onAmount();
    recalc();
  }

  function renderSkuBox() {
    var box = byId('tsSkuBox'); if (!box) return;
    var opts = skusForCats(state.formCats);
    if (!opts.length) { box.innerHTML = '<span style="font-size:11px;color:var(--text-muted);">Select categories first (or ⭐ All).</span>'; return; }
    box.innerHTML = opts.map(function (s) {
      var on = state.formSkus.indexOf(s) >= 0;
      return '<label class="ts-chip' + (on ? ' on' : '') + '"><input type="checkbox" ' + (on ? 'checked' : '') + ' onchange="TS.toggleSku(' + JSON.stringify(s).replace(/"/g, '&quot;') + ', this.checked)">' + esc(s) + '</label>';
    }).join('');
  }

  function renderFormPhotos() {
    var el = byId('tsFPhotoList'); if (!el) return;
    el.innerHTML = state.formPhotos.map(function (p, i) {
      return '<span style="position:relative;display:inline-block;"><img src="' + p + '" class="ts-photo"><button class="ts-photo-x" title="Remove" onclick="TS.removePhoto(' + i + ')">✕</button></span>';
    }).join('');
  }

  function toggleAllCats(on) {
    state.formCats = on ? [ALL_CATEGORIES] : [];
    state.formSkus = [];
    renderForm();
  }
  function toggleCat(name, on) {
    if (isAllCats(state.formCats)) state.formCats = [];
    var i = state.formCats.indexOf(name);
    if (on && i < 0) state.formCats.push(name);
    if (!on && i >= 0) state.formCats.splice(i, 1);
    state.formSkus = state.formSkus.filter(function (s) { return skusForCats(state.formCats).indexOf(s) >= 0; });
    renderForm();
  }
  function toggleSku(name, on) {
    var i = state.formSkus.indexOf(name);
    if (on && i < 0) state.formSkus.push(name);
    if (!on && i >= 0) state.formSkus.splice(i, 1);
    recalc();
  }
  function onTypeChange() {
    var sel = byId('tsFType');
    byId('tsFTypeCustom').style.display = sel.value === '__OTHER__' ? '' : 'none';
    recalc();
  }
  function onClaim() {
    byId('tsFClaimRef').style.display = byId('tsFClaim').value === 'Yes' ? '' : 'none';
  }
  function onSplit() {
    var pct = parseInt(byId('tsFSplit').value, 10);
    byId('tsFSplitL').textContent = pct + '%';
    byId('tsFSplitR').textContent = (100 - pct) + '%';
    onAmount();
  }
  function onAmount() {
    var total = num(byId('tsFAmount') && byId('tsFAmount').value);
    var pct = parseInt((byId('tsFSplit') && byId('tsFSplit').value) || 50, 10);
    var la = byId('tsFSplitLA'), ra = byId('tsFSplitRA');
    if (la) la.textContent = 'Relia ' + fmtSAR(total * pct / 100);
    if (ra) ra.textContent = 'Roshen ' + fmtSAR(total * (100 - pct) / 100);
    recalc();
  }

  function formCustCode() {
    var v = (byId('tsFCust') && byId('tsFCust').value) || '';
    var m = v.split('—');
    return m[0].trim();
  }
  function formCustName() {
    var code = formCustCode();
    var c = salesCustomers().find(function (x) { return x.acct === code; });
    if (c) return c.name;
    var v = (byId('tsFCust') && byId('tsFCust').value) || '';
    var i = v.indexOf('—');
    return i >= 0 ? v.slice(i + 1).trim() : '';
  }
  function formActType() {
    var sel = byId('tsFType'); if (!sel) return '';
    if (sel.value === '__OTHER__') return (byId('tsFTypeCustom').value || '').trim();
    return sel.value;
  }

  function perfMode() {
    var el = byId('tsFPerfMode');
    return el ? el.value : 'recalc'; // no selector = new activity = always calculate
  }

  var _recalcT = null;
  function recalc() {
    clearTimeout(_recalcT);
    _recalcT = setTimeout(function () {
      var custCode = formCustCode();
      var cats = state.formCats;
      var actType = formActType();
      var dateStr = byId('tsFDate') && byId('tsFDate').value;
      var total = num(byId('tsFAmount') && byId('tsFAmount').value);
      var set = function (id, v) { var el = byId(id); if (el) el.textContent = v; };
      if (state.editingId && perfMode() === 'keep') {
        // Preview shows exactly what will be saved: the original figures.
        var a0 = findAct(state.editingId) || {};
        set('tsPerfPre', fmtSAR(a0.preAmount));
        set('tsPerfPost', fmtSAR(a0.postAmount));
        set('tsPerfUplift', fmtPct(a0.uplift));
        set('tsPerfRoi', fmtPct(a0.roi));
        set('tsPerfVerdict', a0.verdict || 'Pending');
        set('tsPerfWin', (a0.postStartDate || '—') + ' → ' + (a0.postEndDate || '—') + ' · 🔒 original preserved');
        return;
      }
      if (!custCode || !cats.length || !dateStr) {
        ['tsPerfPre', 'tsPerfPost', 'tsPerfUplift', 'tsPerfRoi', 'tsPerfVerdict', 'tsPerfWin'].forEach(function (id) { set(id, '—'); });
        return;
      }
      if (!datasetReady()) { set('tsPerfWin', 'Sales dataset not loaded'); return; }
      var p = computePerf(custCode, cats, state.formSkus, actType, dateStr, state.editingId, total);
      set('tsPerfPre', fmtSAR(p.preAmount));
      set('tsPerfPost', fmtSAR(p.postAmount));
      set('tsPerfUplift', p.upliftNew ? 'New' : fmtPct(p.uplift));
      set('tsPerfRoi', fmtPct(p.roi));
      set('tsPerfVerdict', total > 0 ? p.verdict : 'Pending');
      set('tsPerfWin', p.periods.postStartDateStr + ' → ' + p.periods.postEndDateStr + ' (' + p.periods.postDays + 'd)' + (p.periods.truncatedBy ? ' ✂ ' + p.periods.truncatedBy : ''));
    }, 150);
  }

  function readFileScaled(file, maxDim, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      if (String(file.type).indexOf('image/') !== 0) { cb(reader.result); return; }
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        if (scale >= 1) { cb(reader.result); return; }
        var cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        cb(cv.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = function () { cb(reader.result); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function onPhotos(input) {
    Array.prototype.slice.call(input.files || []).forEach(function (f) {
      readFileScaled(f, 1400, function (dataUrl) {
        state.formPhotos.push(dataUrl);
        renderFormPhotos();
      });
    });
    input.value = '';
  }
  function removePhoto(i) { state.formPhotos.splice(i, 1); renderFormPhotos(); }
  function onCreditNote(input) {
    var f = input.files && input.files[0]; if (!f) return;
    readFileScaled(f, 1600, function (dataUrl) {
      state.formCreditNote = { image: dataUrl, filename: f.name };
      var el = byId('tsFCnName'); if (el) el.textContent = f.name;
    });
    input.value = '';
  }

  async function saveActivity() {
    var editing = state.editingId ? findAct(state.editingId) : null;
    if (editing && !canEditRow(editing)) { toast('This record is locked for you.', true); return; }
    if (!editing && !can('ts.create')) { toast('You do not have permission to create activities.', true); return; }

    var custCode = formCustCode();
    var custName = formCustName();
    var actType = formActType();
    var dateStr = byId('tsFDate').value;
    var total = num(byId('tsFAmount').value);
    if (!custCode) { toast('Customer is required.', true); return; }
    if (!state.formCats.length) { toast('Select at least one category (or ⭐ All).', true); return; }
    if (!actType) { toast('Activity type is required.', true); return; }
    if (!dateStr) { toast('Activity date is required.', true); return; }
    if (!(total > 0)) { toast('Total amount must be greater than zero.', true); return; }

    var a = editing ? editing : {
      id: generateActivityId(),
      createdBy: currentUserEmail(),
      createdAt: new Date().toISOString(),
      roshenStatus: 'Pending Approval',
      reliaStatus: 'Pending Approval',
      finalApproved: 'No'
    };
    // If a final-rejected record is edited by its creator, it returns to the
    // approval flow — exactly like legacy.
    if (editing && finalState(a) === 'Rejected') {
      a.finalApproved = 'No';
      a.finalRejectedBy = null; a.finalRejectedAt = null; a.finalRejectReason = null;
      a.roshenStatus = 'Pending Approval'; a.reliaStatus = 'Pending Approval';
      a.roshenApprovedBy = null; a.roshenApprovedAt = null; a.roshenRejectedBy = null; a.roshenRejectedAt = null;
      a.reliaApprovedBy = null; a.reliaApprovedAt = null; a.reliaRejectedBy = null; a.reliaRejectedAt = null;
    }

    var pct = parseInt(byId('tsFSplit').value, 10);
    // Historical-value protection: 'keep' preserves the saved performance
    // figures (Sales Before/After, Uplift, ROI, Verdict, period windows)
    // exactly as they were at approval time; 'recalc' refreshes them from
    // the live Dashboard dataset (always the case for NEW activities).
    var keepPerf = !!editing && perfMode() === 'keep';
    var perf = (!keepPerf && datasetReady()) ? computePerf(custCode, state.formCats, state.formSkus, actType, dateStr, state.editingId, total) : null;

    a.custCode = custCode;
    a.custName = custName;
    a.distributor = byId('tsFDist').value.trim();
    a.categories = state.formCats.slice();
    a.category = isAllCats(state.formCats) ? ALL_CATEGORIES : state.formCats[0];
    a.skus = state.formSkus.slice();
    a.actType = actType;
    a.activityDate = dateStr;
    a.startDate = dateStr;
    a.totalAmount = total;
    a.reliaPct = pct; a.roshenPct = 100 - pct;
    a.reliaAmount = total * pct / 100;
    a.roshenAmount = total * (100 - pct) / 100;
    a.execStatus = byId('tsFExec').value;
    a.claimReceived = byId('tsFClaim').value;
    a.claimRef = byId('tsFClaim').value === 'Yes' ? byId('tsFClaimRef').value.trim() : '';
    a.numFloorDisplays = byId('tsFNumFD').value ? num(byId('tsFNumFD').value) : null;
    a.metersValue = byId('tsFMeters').value ? num(byId('tsFMeters').value) : null;
    a.numBranches = byId('tsFNumBr').value ? num(byId('tsFNumBr').value) : null;
    a.notes = byId('tsFNotes').value;
    a.execPhotos = state.formPhotos.slice();
    a.execPhotoCount = a.execPhotos.length;
    a.creditNoteImage = state.formCreditNote.image;
    a.creditNoteFilename = state.formCreditNote.filename;
    if (perf) {
      a.preStartDate = perf.periods.preStartDateStr; a.preEndDate = perf.periods.preEndDateStr;
      a.postStartDate = perf.periods.postStartDateStr; a.postEndDate = perf.periods.postEndDateStr;
      a.endDate = perf.periods.postEndDateStr;
      a.duration = perf.periods.postDays;
      a.truncatedBy = perf.periods.truncatedBy;
      a.rentalMonths = perf.periods.rentalMonths;
      a.preAmount = perf.preAmount; a.preCases = perf.preCases;
      a.postAmount = perf.postAmount; a.postCases = perf.postCases;
      a.incremental = perf.incremental;
      a.uplift = perf.uplift; a.roi = perf.roi; a.verdict = perf.verdict;
      // provenance stamp for audit: when and by whom figures were (re)computed
      a.perfSource = 'dashboard-dataset';
      a.perfCalculatedAt = new Date().toISOString();
      a.perfCalculatedBy = currentUserEmail();
    } else if (keepPerf) {
      a.perfPreserved = true; // original approval-time figures intentionally kept
    }
    a.overallStatus = computeOverall(a);
    a.updatedBy = currentUserEmail();
    a.updatedAt = new Date().toISOString();

    if (STD_TYPES.indexOf(actType) < 0 && state.customTypes.indexOf(actType) < 0) state.customTypes.push(actType);

    var ok = await persistActivity(a);
    if (!ok) return;
    if (!editing) state.activities.push(a);
    toast((editing ? 'Saved changes to ' : 'Created ') + a.id);
    state.editingId = null;
    switchTab('log');
  }

  function editActivity(id) {
    var a = findAct(id); if (!a) return;
    if (!canEditRow(a)) { toast('This record is locked for you.', true); return; }
    state.editingId = id;
    switchTab('new');
  }
  function cancelEdit() { state.editingId = null; renderForm(); }
  function resetForm() { if (!state.editingId) { state.formCats = []; state.formSkus = []; state.formPhotos = []; state.formCreditNote = { image: '', filename: '' }; } renderForm(); }

  // ───────────────────────────────────────────────────────────────────────────
  // UI — Analysis (Chart.js with the Dashboard chart registry/theme)
  // ───────────────────────────────────────────────────────────────────────────
  function renderAnalysis() {
    var host = byId('tsAnalysisHost');
    if (!host) return;
    var acts = state.activities;
    if (!acts.length) {
      host.innerHTML = '<div class="ts-empty"><div class="ts-empty-icon">📊</div><h3>No activities to analyse yet</h3></div>';
      return;
    }
    host.innerHTML =
      '<div class="chart-row cols-2-eq">' +
      '<div class="card"><div class="card-header"><div class="card-title"><span class="icon-bullet"></span> Spend by Category</div></div><div class="chart-container"><canvas id="tsChartCat"></canvas></div></div>' +
      '<div class="card"><div class="card-header"><div class="card-title"><span class="icon-bullet"></span> ROI by Activity Type</div></div><div class="chart-container"><canvas id="tsChartRoi"></canvas></div></div>' +
      '</div>' +
      '<div class="chart-row cols-2-eq">' +
      '<div class="card"><div class="card-header"><div class="card-title"><span class="icon-bullet"></span> Verdicts</div></div><div class="chart-container"><canvas id="tsChartVerdict"></canvas></div></div>' +
      '<div class="card"><div class="card-header"><div class="card-title"><span class="icon-bullet"></span> Relia / Roshen Split</div></div><div class="chart-container"><canvas id="tsChartSplit"></canvas></div></div>' +
      '</div>';
    if (typeof Chart === 'undefined') return;
    var byCat = {}, roiByType = {}, verdicts = {}, splitTotals = { Relia: 0, Roshen: 0 };
    acts.forEach(function (a) {
      var label = isAllCats(getCats(a)) ? 'All Categories' : getCats(a).join(', ');
      byCat[label] = (byCat[label] || 0) + num(a.totalAmount);
      if (a.roi != null && a.actType) {
        (roiByType[a.actType] = roiByType[a.actType] || []).push(a.roi);
      }
      var v = a.verdict || 'Pending';
      verdicts[v] = (verdicts[v] || 0) + 1;
      splitTotals.Relia += num(a.reliaAmount);
      splitTotals.Roshen += num(a.roshenAmount);
    });
    var mk = function (id, cfg) {
      var el = byId(id); if (!el) return;
      if (typeof CHARTS !== 'undefined' && CHARTS[id]) { try { CHARTS[id].destroy(); } catch (e) {} }
      var ch = new Chart(el.getContext('2d'), cfg);
      if (typeof CHARTS !== 'undefined') CHARTS[id] = ch;
    };
    var accent = tokenColor('--gold', '#E85D6F');
    var blue = tokenColor('--c-blue', '#2A78D6');
    var green = tokenColor('--green', '#34C77B');
    var red = tokenColor('--red', '#FF6B6B');
    var amber = tokenColor('--amber', '#FFB020');
    var textCol = tokenColor('--text-secondary', '#8FA3BD');
    var noLegend = { plugins: { legend: { display: false } }, responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: textCol } }, y: { ticks: { color: textCol } } } };
    mk('tsChartCat', { type: 'bar', data: { labels: Object.keys(byCat), datasets: [{ data: Object.values(byCat), backgroundColor: accent, borderRadius: 6 }] }, options: noLegend });
    var roiLabels = Object.keys(roiByType);
    var roiVals = roiLabels.map(function (t) { var xs = roiByType[t]; return xs.reduce(function (s, x) { return s + x; }, 0) / xs.length * 100; });
    mk('tsChartRoi', { type: 'bar', data: { labels: roiLabels, datasets: [{ data: roiVals, backgroundColor: roiVals.map(function (v) { return v >= 20 ? green : (v >= 0 ? amber : red); }), borderRadius: 6 }] }, options: noLegend });
    mk('tsChartVerdict', { type: 'doughnut', data: { labels: Object.keys(verdicts), datasets: [{ data: Object.values(verdicts), backgroundColor: [green, amber, red, textCol] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: textCol } } } } });
    mk('tsChartSplit', { type: 'doughnut', data: { labels: ['Relia', 'Roshen'], datasets: [{ data: [splitTotals.Relia, splitTotals.Roshen], backgroundColor: [blue, accent] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: textCol } } } } });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // EXPORTS — Excel (native XLSX already loaded) + PDF (lazy jsPDF, legacy parity)
  // ───────────────────────────────────────────────────────────────────────────
  function exportExcel() {
    if (!can('ts.export')) { toast('You do not have export permission.', true); return; }
    if (!state.activities.length) { toast('No activities to export.', true); return; }
    if (typeof XLSX === 'undefined') { toast('Excel library not loaded yet — try again in a moment.', true); return; }
    var data = state.activities.map(function (a) {
      return {
        'Activity ID': a.id,
        'Customer Code': a.custCode,
        'Customer Name': a.custName,
        'Category': catLabel(a),
        'SKUs': (a.skus || []).join('; '),
        'Activity Type': a.actType,
        'Activity Date': a.activityDate || a.startDate,
        'Rental Months': a.rentalMonths || '',
        'Floor Displays': a.numFloorDisplays || '',
        'Meters': a.metersValue || '',
        'Branches': a.numBranches || '',
        'Photos Count': a.execPhotoCount || (a.execPhotos ? a.execPhotos.length : 0),
        'Pre Period Start': a.preStartDate || '',
        'Pre Period End': a.preEndDate || '',
        'Post Period Start': a.postStartDate || a.startDate,
        'Post Period End': a.postEndDate || a.endDate,
        'Post Duration (days)': a.duration,
        'Truncated By Next Activity': a.truncatedBy || '',
        'Total Amount (SAR)': a.totalAmount,
        'Relia %': a.reliaPct,
        'Relia Amount (SAR)': a.reliaAmount,
        'Roshen %': a.roshenPct,
        'Roshen Amount (SAR)': a.roshenAmount,
        'Sales Before (SAR)': a.preAmount,
        'Sales After (SAR)': a.postAmount,
        'Cases Before': a.preCases,
        'Cases After': a.postCases,
        'Incremental (SAR)': a.incremental,
        'Uplift %': a.uplift != null ? (a.uplift * 100).toFixed(2) + '%' : '',
        'ROI %': a.roi != null ? (a.roi * 100).toFixed(2) + '%' : '',
        'Verdict': a.verdict,
        'Execution Status': a.execStatus,
        'Credit Note': a.creditNoteFilename || '',
        'Approval Email Subject': a.approvalEmailSubject || a.reliaEmailSubject || '',
        'Relia Status': a.reliaStatus,
        'Roshen Status': a.roshenStatus,
        'Overall Status': a.overallStatus,
        'Claim Received': getClaim(a),
        'Claim Reference': a.claimRef || '',
        'Final Approved': getFinal(a),
        'Final Approved By': a.finalApprovedBy || '',
        'Final Approved At': a.finalApprovedAt || '',
        'Notes': a.notes,
        'Created': a.createdAt,
        'Updated': a.updatedAt
      };
    });
    var ws = XLSX.utils.json_to_sheet(data);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Trade Spend Log');
    XLSX.writeFile(wb, 'TradeSpend_Export_' + todayStr() + '.xlsx');
  }

  var _pdfLoading = null;
  function ensurePdfLibs() {
    if (window.jspdf && window.html2canvas) return Promise.resolve();
    if (_pdfLoading) return _pdfLoading;
    var load = function (src) {
      return new Promise(function (res, rej) {
        var s = document.createElement('script');
        s.src = src; s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    };
    _pdfLoading = Promise.all([
      load('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
      load('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
    ]);
    return _pdfLoading;
  }

  async function exportPdf() {
    if (!can('ts.export')) { toast('You do not have export permission.', true); return; }
    var node = byId('ts-panel-log');
    if (!node || !state.activities.length) { toast('Nothing to export.', true); return; }
    toast('Preparing PDF…');
    try {
      await ensurePdfLibs();
      var canvas = await window.html2canvas(node, { scale: 2, useCORS: true, backgroundColor: tokenColor('--bg-deep', '#0B1220') });
      var jsPDF = window.jspdf.jsPDF;
      var pdf = new jsPDF('l', 'mm', 'a4');
      var pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
      var iw = pw - 16, ih = canvas.height * iw / canvas.width;
      var y = 0, page = 0;
      while (y < ih) {
        if (page > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 8, 8 - y, iw, ih);
        y += ph - 16;
        page++;
        if (page > 20) break;
      }
      pdf.save('TradeSpend_Log_' + todayStr() + '.pdf');
    } catch (e) {
      console.error(e);
      toast('PDF export failed: ' + ((e && e.message) || e), true);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Shell wiring — tabs, render, init
  // ───────────────────────────────────────────────────────────────────────────
  function activeTab() { return state.tab; }

  function switchTab(tab) {
    if (TABS.indexOf(tab) === -1) tab = 'log';
    state.tab = tab;
    render();
  }

  function renderCurrent() {
    renderKpis();
    if (state.tab === 'log') renderLog();
    else if (state.tab === 'new') renderForm();
    else renderAnalysis();
  }

  function render() {
    var view = byId('view-tradespend');
    if (!view) return;
    try {
      var tabs = view.querySelectorAll('[data-ts-tab]');
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.toggle('active', tabs[i].getAttribute('data-ts-tab') === state.tab);
      }
      for (var j = 0; j < TABS.length; j++) {
        var p = byId('ts-panel-' + TABS[j]);
        if (p) p.classList.toggle('active', TABS[j] === state.tab);
      }
      bootData();
      renderCurrent();
    } catch (e) { console.error('TS render failed', e); }
  }

  var _booted = false;
  function bootData() {
    if (_booted) return;
    _booted = true;
    resolveAuth().then(function () {
      loadActivities().then(function () {
        subscribeRealtime();
        startPolling();
        if (CURRENT_MODE === 'tradespend') renderCurrent();
      });
    });
  }

  function onSearch(v) { state.search = v; renderLog(); }
  function onStatusFilter(v) { state.statusFilter = v; renderLog(); }
  function reload() { reloadNow(); }

  function init() {
    var tabsRoot = byId('tsTabs');
    if (tabsRoot && !tabsRoot._tsBound) {
      tabsRoot._tsBound = true;
      tabsRoot.addEventListener('click', function (e) {
        var el = e.target && e.target.closest ? e.target.closest('[data-ts-tab]') : null;
        if (el) switchTab(el.getAttribute('data-ts-tab'));
      });
    }
    var modal = byId('tsModal');
    if (modal && !modal._tsBound) {
      modal._tsBound = true;
      modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public surface (used by inline handlers + shell integration)
  return {
    render: render,
    switchTab: switchTab,
    activeTab: activeTab,
    reload: reload,
    onSearch: onSearch,
    onStatusFilter: onStatusFilter,
    openView: openView,
    closeModal: closeModal,
    zoomPhoto: zoomPhoto,
    editActivity: editActivity,
    cancelEdit: cancelEdit,
    resetForm: resetForm,
    saveActivity: saveActivity,
    deleteActivity: deleteActivity,
    roshenDecision: roshenDecision,
    reliaDecision: reliaDecision,
    finalApprove: finalApprove,
    finalReject: finalReject,
    toggleAllCats: toggleAllCats,
    toggleCat: toggleCat,
    toggleSku: toggleSku,
    onTypeChange: onTypeChange,
    onClaim: onClaim,
    onSplit: onSplit,
    onAmount: onAmount,
    onPhotos: onPhotos,
    removePhoto: removePhoto,
    onCreditNote: onCreditNote,
    recalc: recalc,
    exportExcel: exportExcel,
    exportPdf: exportPdf,
    // exposed for validation tooling (M6 parity checks)
    _internals: { computeOverall: computeOverall, computePerf: computePerf, calcSalesForRange: calcSalesForRange, getPeriodForActivity: getPeriodForActivity, activityToRow: activityToRow, rowToActivity: rowToActivity, can: can, auth: auth }
  };
})();
