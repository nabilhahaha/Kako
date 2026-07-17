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

  // Visible build stamp — lets anyone confirm which build a browser is running.
  var TS_BUILD = 'Engine V2 · 2026-07-17';
  try { console.info('[Roshen Trade Spend] ' + TS_BUILD); } catch (e) {}

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
    var amount = 0, cases = 0, discount = 0, returnsAmt = 0;
    var hasDi = !!(D.di && D.di.length);
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
        if (hasDi) discount += D.di[i];
        if (D.s[i] < 0) returnsAmt += -D.s[i];
      }
    }
    // amount is NET (after discounts, returns already netted as negative rows).
    // gross = net + discount; discountPct = discount / gross.
    var gross = amount + discount;
    return { amount: amount, cases: cases, discount: discount, gross: gross,
             discountPct: gross > 0 ? discount / gross : null, returnsAmount: returnsAmt };
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
    var duringDays = dayDiff(actualPostEndDate, activityDate);

    // AFTER window — the post-promotion period, same length as the actual
    // during window, starting the day after it ends. Unmeasurable (0 days)
    // when the next same-customer overlapping activity starts immediately:
    // its promotion effect would contaminate the dip measurement.
    var afterStartDate = new Date(actualPostEndDate);
    afterStartDate.setDate(afterStartDate.getDate() + 1);
    var afterEndDate = new Date(afterStartDate);
    afterEndDate.setDate(afterEndDate.getDate() + duringDays - 1);
    var afterBlocked = false;
    if (futureActivities.length > 0) {
      var blockDate = new Date(futureActivities[0].activityDate);
      if (blockDate <= afterStartDate) afterBlocked = true;
      else if (blockDate <= afterEndDate) { afterEndDate = new Date(blockDate); afterEndDate.setDate(afterEndDate.getDate() - 1); }
    }

    return {
      preStartDateStr: fmt(preStartDate),
      preEndDateStr: fmt(preEndDate),
      postStartDateStr: activityDateStr,
      postEndDateStr: fmt(actualPostEndDate),
      postDays: duringDays,
      afterStartDateStr: afterBlocked ? null : fmt(afterStartDate),
      afterEndDateStr: afterBlocked ? null : fmt(afterEndDate),
      afterBlocked: afterBlocked,
      truncatedBy: truncatedBy,
      rentalMonths: months
    };
  }

  // Other activities for the same customer with overlapping categories whose
  // DURING window intersects this activity's during window (same-day starts,
  // simultaneous promotions). Consecutive activities are handled by window
  // truncation; simultaneous ones share incremental sales, so the UI warns.
  function overlappingActivities(custCode, cats, activityDateStr, postEndDateStr, currentId) {
    var s1 = dateToInt(activityDateStr), e1 = dateToInt(postEndDateStr);
    return state.activities.filter(function (x) {
      if (x.id === currentId || x.custCode !== custCode || !x.activityDate) return false;
      if (!catsOverlap(getCats(x), cats)) return false;
      var p = getPeriodForActivity(x.actType, x.activityDate, x.id, x.custCode, getCats(x));
      var s2 = dateToInt(p.postStartDateStr), e2 = dateToInt(p.postEndDateStr);
      return s2 <= e1 && e2 >= s1 && !(s2 > s1); // starts on/before ours and overlaps
    }).map(function (x) { return x.id; });
  }

  // Days of a window that carry sales-data coverage (clamped to the loaded
  // dataset's date range). Falls back to the full window when bounds are
  // unavailable. A window can also be partially or fully outside coverage —
  // e.g. an activity newer than the last sales import.
  function coveredDays(startStr, endStr) {
    var from = dateToInt(startStr), to = dateToInt(endStr);
    if (typeof META !== 'undefined' && META && META.dateMin && META.dateMax) {
      from = Math.max(from, dateToInt(META.dateMin));
      to = Math.min(to, dateToInt(META.dateMax));
    }
    return Math.max(0, to - from + 1);
  }

  // pre/post → baseline, incremental, uplift, ROI, verdict.
  //
  // BUSINESS-CORRECT (day-normalized, coverage-aware) methodology:
  // pre and post windows can legitimately differ in length (calendar months,
  // truncation by the next activity, or partial data coverage), so raw sums
  // are never compared directly. Both windows are converted to AVERAGE DAILY
  // sales over their COVERED days; the baseline is the pre-period daily rate
  // pro-rated over the covered post days.
  //   baseline    = preRate × postDaysCovered
  //   incremental = postAmount − baseline
  //   uplift      = (postRate − preRate) / preRate
  //   ROI         = (incremental − spend) / spend        [revenue-based net ROI]
  // If either window has ZERO covered days (e.g. the activity is newer than
  // the last sales import), metrics are null and the verdict is 'Pending' —
  // never a fake −100% Loss on missing data.
  function computePerf(custCode, cats, skus, actType, activityDateStr, currentId, totalAmount) {
    var periods = getPeriodForActivity(actType, activityDateStr, currentId, custCode, cats);
    var pre = calcSalesForRange(custCode, cats, skus, periods.preStartDateStr, periods.preEndDateStr);
    var post = calcSalesForRange(custCode, cats, skus, periods.postStartDateStr, periods.postEndDateStr);
    var preDays = coveredDays(periods.preStartDateStr, periods.preEndDateStr);
    var postDays = coveredDays(periods.postStartDateStr, periods.postEndDateStr);

    // AFTER (post-promotion) window — measured only when it exists and has data.
    var after = { amount: null, cases: null }, afterDays = 0;
    if (periods.afterStartDateStr) {
      afterDays = coveredDays(periods.afterStartDateStr, periods.afterEndDateStr);
      if (afterDays > 0) after = calcSalesForRange(custCode, cats, skus, periods.afterStartDateStr, periods.afterEndDateStr);
    }

    var baseline = null, baselineFloored = false, incremental = null, uplift = null, upliftNew = false;
    var roi = null, rots = null, retention = null, afterVsBaseline = null;
    if (preDays > 0 && postDays > 0) {
      var preRate = pre.amount / preDays;
      var postRate = post.amount / postDays;
      baseline = preRate * postDays;
      // A returns-heavy pre period can push the baseline negative, which would
      // credit the activity with phantom incremental. Floor at zero.
      if (baseline < 0) { baseline = 0; baselineFloored = true; }
      incremental = post.amount - baseline;
      if (preRate > 0) uplift = (postRate - preRate) / preRate;
      upliftNew = preRate <= 0 && postRate > 0;
      if (totalAmount > 0) {
        roi = (incremental - totalAmount) / totalAmount;   // net ROI
        rots = incremental / totalAmount;                  // return on trade spend (gross multiple)
      }
      if (afterDays > 0 && after.amount != null) {
        var afterRate = after.amount / afterDays;
        if (preRate > 0) retention = afterRate / preRate;  // post-promo retention vs baseline rate
        afterVsBaseline = after.amount - (baselineFloored ? 0 : preRate * afterDays);
      }
    }
    var spendPct = (totalAmount > 0 && post.amount > 0) ? totalAmount / post.amount : null; // trade spend as % of during net sales
    var verdict = 'Pending';
    if (roi != null) verdict = roi >= 0.2 ? 'Successful' : (roi >= 0 ? 'Break-even' : 'Loss');
    return {
      periods: periods,
      preAmount: pre.amount, preCases: pre.cases, preDiscountPct: pre.discountPct,
      postAmount: post.amount, postCases: post.cases, postDiscountPct: post.discountPct,
      afterAmount: after.amount, afterCases: after.cases, afterDaysCovered: afterDays,
      baselineAmount: baseline, baselineFloored: baselineFloored,
      preDaysCovered: preDays, postDaysCovered: postDays,
      incremental: incremental, uplift: uplift, upliftNew: upliftNew,
      roi: roi, rots: rots, spendPct: spendPct,
      retention: retention, afterVsBaseline: afterVsBaseline,
      overlaps: overlappingActivities(custCode, cats, activityDateStr, periods.postEndDateStr, currentId),
      verdict: verdict
    };
  }

  // LIVE PERFORMANCE — every display (log, detail view, analysis, exports)
  // computes Sales Before/After, Uplift, ROI and Verdict from the CURRENT
  // Dashboard sales dataset. Stored figures are only a fallback for records
  // whose customer code cannot be resolved in the dataset (e.g. malformed
  // codes) or before the dataset has loaded. Memoized per dataset version.
  var _livePerfCache = new Map();
  function livePerf(a) {
    if (!datasetReady() || !a || !a.custCode || !a.activityDate) return null;
    var idx = salesIndex();
    if (!idx || !(idx.idByAcct.get(a.custCode) || []).length) return null;
    var sig = state.salesIdxSig + '|' + state.activities.length;
    var hit = _livePerfCache.get(a.id);
    if (hit && hit.sig === sig) return hit.perf;
    var perf = computePerf(a.custCode, getCats(a), a.skus || [], a.actType, a.activityDate, a.id, num(a.totalAmount));
    _livePerfCache.set(a.id, { sig: sig, perf: perf });
    return perf;
  }
  // Unified view-model: live figures when computable, stored snapshot otherwise.
  function displayPerf(a) {
    var p = livePerf(a);
    if (!p) {
      return { pre: a.preAmount, post: a.postAmount, preCases: a.preCases, postCases: a.postCases,
               baseline: a.baselineAmount != null ? a.baselineAmount : null,
               preCov: a.preDaysCovered, postCov: a.postDaysCovered,
               inc: a.incremental, uplift: a.uplift, roi: a.roi, verdict: a.verdict || 'Pending',
               postStart: a.postStartDate, postEnd: a.postEndDate, days: a.duration,
               trunc: a.truncatedBy, live: false };
    }
    return { pre: p.preAmount, post: p.postAmount, preCases: p.preCases, postCases: p.postCases,
             baseline: p.baselineAmount, baselineFloored: p.baselineFloored,
             preCov: p.preDaysCovered, postCov: p.postDaysCovered,
             after: p.afterAmount, afterCov: p.afterDaysCovered,
             afterStart: p.periods.afterStartDateStr, afterEnd: p.periods.afterEndDateStr,
             inc: p.incremental, uplift: p.uplift, roi: p.roi,
             rots: p.rots, spendPct: p.spendPct, retention: p.retention,
             preDiscountPct: p.preDiscountPct, postDiscountPct: p.postDiscountPct,
             overlaps: p.overlaps,
             verdict: (num(a.totalAmount) > 0 ? p.verdict : 'Pending'),
             postStart: p.periods.postStartDateStr, postEnd: p.periods.postEndDateStr,
             days: p.periods.postDays, trunc: p.periods.truncatedBy, live: true };
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
      _livePerfCache.clear(); // activity set changed → truncation windows may shift
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

  // Row actions use data attributes + ONE delegated listener (bound in init)
  // instead of inline onclick — the reliable pattern for touch browsers
  // (iOS Safari can swallow inline-handler clicks inside horizontal scrollers).
  function actionButtons(a) {
    var out = [];
    var b = function (act, label, cls, disabled, title) {
      out.push('<button type="button" class="ts-act-btn ' + (cls || '') + '"' + (disabled ? ' disabled' : '') +
        (title ? ' title="' + esc(title) + '"' : '') +
        ' data-act="' + act + '" data-id="' + esc(a.id) + '">' + label + '</button>');
    };
    b('view', '👁 View', '');
    if (canEditRow(a)) b('edit', '✏️ Edit', '');
    if (can('ts.approve.roshen') && a.roshenStatus === 'Pending Approval') {
      b('roshen-ok', '✓ Roshen', 'ok');
      b('roshen-no', '✗ Roshen', 'bad');
    }
    if (can('ts.approve.relia') && a.reliaStatus === 'Pending Approval') {
      b('relia-ok', '✓ Relia', 'ok');
      b('relia-no', '✗ Relia', 'bad');
    }
    if (canFinalApprove() && finalState(a) === 'No') {
      var prereq = a.roshenStatus === 'Approved' && a.reliaStatus === 'Approved';
      b('final-ok', '✓ Final', 'ok', !prereq, prereq ? '' : 'Requires Roshen + Relia approved');
      b('final-no', '✗ Final', 'bad', !prereq, prereq ? '' : 'Requires Roshen + Relia approved');
    }
    if (canDeleteRow(a)) b('delete', '🗑', 'bad', false, 'Delete');
    return '<div class="ts-actions">' + out.join('') + '</div>';
  }

  function handleAction(act, id) {
    if (act === 'view') openView(id);
    else if (act === 'edit') editActivity(id);
    else if (act === 'delete') deleteActivity(id);
    else if (act === 'roshen-ok') roshenDecision(id, 'Approved');
    else if (act === 'roshen-no') roshenDecision(id, 'Rejected');
    else if (act === 'relia-ok') reliaDecision(id, 'Approved');
    else if (act === 'relia-no') reliaDecision(id, 'Rejected');
    else if (act === 'final-ok') finalApprove(id);
    else if (act === 'final-no') finalReject(id);
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
    set('tsKpiActivities', String(acts.length), state.cloudError === 'offline' ? 'Cloud sign-in required' : 'Live from cloud · ' + TS_BUILD);
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
      var dp = displayPerf(a); // live figures from the current dataset
      var period = (a.activityDate || '—') + ' → ' + (dp.postEnd || '—');
      var lock = finalState(a) === 'Yes' ? ' 🔒' : '';
      return '<tr>' +
        '<td style="font-weight:700;white-space:nowrap;">' + esc(a.id) + lock + '</td>' +
        '<td><div style="font-weight:600;">' + esc(a.custName || '—') + '</div><div style="font-size:10px;color:var(--text-muted);">' + esc(a.custCode || '') + '</div></td>' +
        '<td>' + esc(catLabel(a)) + '</td>' +
        '<td>' + esc(a.actType || '—') + '</td>' +
        '<td style="font-size:11px;white-space:nowrap;">' + esc(period) + '</td>' +
        '<td style="text-align:right;font-weight:700;white-space:nowrap;">' + (a.totalAmount != null ? Math.round(a.totalAmount).toLocaleString('en-US') : '—') + '</td>' +
        '<td style="text-align:right;white-space:nowrap;' + (dp.inc != null && dp.inc < 0 ? 'color:var(--red);' : '') + '">' + (dp.inc != null && isFinite(dp.inc) ? Math.round(dp.inc).toLocaleString('en-US') : '—') + '</td>' +
        '<td>' + fmtPct(dp.uplift) + '</td>' +
        '<td>' + fmtPct(dp.roi) + '</td>' +
        '<td>' + verdictBadge(dp.verdict) + '</td>' +
        '<td>' + esc(getClaim(a)) + '</td>' +
        '<td>' + approvalsCell(a) + '</td>' +
        '<td>' + statusBadge(st) + '</td>' +
        '<td>' + actionButtons(a) + '</td>' +
        '</tr>';
    }).join('');
    host.innerHTML =
      '<div style="overflow-x:auto;">' +
      '<table class="data-table ts-log-table" style="width:100%;">' +
      '<thead><tr><th>Code</th><th>Customer</th><th>Category</th><th>Type</th><th>Period</th><th>Spend (SAR)</th><th>Incremental</th><th>Uplift</th><th>ROI</th><th>Verdict</th><th>Claim</th><th>Approvals</th><th>Status</th><th>Actions</th></tr></thead>' +
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
    var dp = displayPerf(a); // live figures from the current dataset
    var covNote = (dp.preCov != null && dp.postCov != null)
      ? '<tr><td>Data Coverage</td><td colspan="2" style="font-size:11px;color:var(--text-muted);">' + dp.preCov + ' before-days · ' + dp.postCov + ' during-days' + (dp.afterCov ? ' · ' + dp.afterCov + ' after-days' : '') + ' with sales data' + (dp.postCov === 0 ? ' — awaiting sales import for the activity period' : '') + '</td></tr>'
      : '';
    var overlapNote = (dp.overlaps && dp.overlaps.length)
      ? '<tr><td>⚠ Overlap</td><td colspan="2" style="font-size:11px;color:var(--amber);">Runs simultaneously with ' + esc(dp.overlaps.join(', ')) + ' for the same customer/categories — incremental sales are shared between them.</td></tr>'
      : '';
    var muted = function (t) { return '<td style="font-size:11px;color:var(--text-muted);">' + t + '</td>'; };
    var perfRows =
      '<tr><td>Sales Before</td><td>' + fmtSAR(dp.pre) + '</td>' + muted((dp.preCases != null ? Math.round(dp.preCases).toLocaleString() + ' cases' : '') + (dp.preDiscountPct != null ? ' · ' + fmtPct(dp.preDiscountPct) + ' disc.' : '')) + '</tr>' +
      '<tr><td>Baseline (pro-rated)</td><td>' + fmtSAR(dp.baseline) + '</td>' + muted('before-period daily rate × during days' + (dp.baselineFloored ? ' · floored at 0 (returns-heavy before-period)' : '')) + '</tr>' +
      '<tr><td>Sales During</td><td>' + fmtSAR(dp.post) + '</td>' + muted((dp.postCases != null ? Math.round(dp.postCases).toLocaleString() + ' cases' : '') + (dp.postDiscountPct != null ? ' · ' + fmtPct(dp.postDiscountPct) + ' disc.' : '')) + '</tr>' +
      '<tr><td>Sales After</td><td>' + (dp.afterCov ? fmtSAR(dp.after) : '—') + '</td>' + muted(dp.afterCov ? (dp.afterStart + ' → ' + dp.afterEnd + (dp.retention != null ? ' · ' + fmtPct(dp.retention) + ' retention vs baseline' : '')) : 'no measurable post-promotion window yet') + '</tr>' +
      '<tr><td>Incremental</td><td>' + fmtSAR(dp.inc) + '</td>' + muted('during − baseline') + '</tr>' +
      '<tr><td>Uplift</td><td>' + fmtPct(dp.uplift) + '</td>' + muted('daily-rate change vs before-period') + '</tr>' +
      '<tr><td>ROI (net)</td><td>' + fmtPct(dp.roi) + '</td><td>' + verdictBadge(dp.verdict) + '</td></tr>' +
      '<tr><td>ROTS</td><td>' + (dp.rots != null ? dp.rots.toFixed(2) + '×' : '—') + '</td>' + muted('incremental per SAR of spend') + '</tr>' +
      '<tr><td>Trade Spend %</td><td>' + fmtPct(dp.spendPct) + '</td>' + muted('spend ÷ during net sales') + '</tr>' +
      covNote + overlapNote;
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
      '<div><div class="ts-view-k">Post Period</div><div class="ts-view-v">' + esc((dp.postStart || '—') + ' → ' + (dp.postEnd || '—')) + (dp.trunc ? ' <span title="Truncated by next activity" style="color:var(--amber);">✂ ' + esc(dp.trunc) + '</span>' : '') + '</div></div>' +
      '<div><div class="ts-view-k">Total Amount</div><div class="ts-view-v">' + fmtSAR(a.totalAmount) + '</div></div>' +
      '<div><div class="ts-view-k">Split</div><div class="ts-view-v">Relia ' + (a.reliaPct != null ? a.reliaPct : 50) + '% (' + fmtSAR(a.reliaAmount) + ') · Roshen ' + (a.roshenPct != null ? a.roshenPct : 50) + '% (' + fmtSAR(a.roshenAmount) + ')</div></div>' +
      '<div><div class="ts-view-k">Execution</div><div class="ts-view-v">' + esc(a.execStatus || '—') + '</div></div>' +
      '<div><div class="ts-view-k">Claim</div><div class="ts-view-v">' + esc(getClaim(a)) + (a.claimRef ? ' · ' + esc(a.claimRef) : '') + '</div></div>' +
      '</div>' +
      ((a.skus || []).length ? '<div class="ts-view-k" style="margin-top:12px;">SKUs</div><div style="font-size:12px;">' + esc((a.skus || []).join('; ')) + '</div>' : '') +
      '<div class="ts-view-k" style="margin-top:14px;">Performance' + (dp.live ? ' <span style="color:var(--green);font-weight:600;">· live from current sales data</span>' : ' <span style="color:var(--text-muted);font-weight:600;">· stored snapshot (customer not in dataset)</span>') + '</div>' +
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

  function perfCell(label, valId, subId) {
    return '<div class="ts-perf-item"><div class="ts-view-k">' + label + '</div><div id="' + valId + '" class="ts-perf-v">—</div>' +
      (subId ? '<div id="' + subId + '" class="ts-perf-sub"></div>' : '') + '</div>';
  }

  function renderForm() {
    var host = byId('tsFormHost');
    if (!host) return;
    if (!can('ts.create') && !state.editingId) {
      host.innerHTML = '<div class="ts-empty"><div class="ts-empty-icon">🔒</div><h3>You do not have permission to create activities</h3>' + (canFinalApprove() ? '<p>Final approvers have read-only access.</p>' : '') + '</div>';
      return;
    }
    var a = state.editingId ? (findAct(state.editingId) || {}) : {};
    // Draft-preserving render: the form is only (re)built and (re)seeded when
    // the target record changes. Chip/SKU toggles and tab switches refresh the
    // dynamic parts without wiping what the user has typed.
    var seedKey = state.editingId || 'new';
    if (state.formSeededFor === seedKey && byId('tsFCust')) {
      renderCatChips(); renderSkuBox(); recalc();
      return;
    }
    state.formSeededFor = seedKey;
    var custs = salesCustomers();
    var custOptions = custs.map(function (c) { return '<option value="' + esc(c.acct + ' — ' + c.name) + '"></option>'; }).join('');
    var pct = a.reliaPct != null ? a.reliaPct : 50;
    state.formCats = getCats(a);
    state.formSkus = (a.skus || []).slice();
    state.formPhotos = (a.execPhotos || []).slice();
    state.formCreditNote = { image: a.creditNoteImage || '', filename: a.creditNoteFilename || '' };
    state.skuSearch = '';
    state.skuShown = {};
    var sec = function (n, title, inner) {
      return '<div class="ts-sec"><div class="ts-sec-t"><span class="ts-sec-n">' + n + '</span>' + title + '</div>' + inner + '</div>';
    };
    host.innerHTML =
      '<div class="card">' +
      '<div class="card-header"><div class="card-title"><span class="icon-bullet"></span> ' + (state.editingId ? 'Edit Activity — ' + esc(state.editingId) : 'New Activity') +
      ' <span class="ts-build-badge" title="Trade Spend build running in this browser">' + TS_BUILD + '</span></div>' +
      (state.editingId ? '<button class="btn" onclick="TS.cancelEdit()">✕ Cancel Edit</button>' : '') + '</div>' +

      sec(1, 'Customer &amp; Scope',
        '<div class="ts-form-grid">' +
        '<div class="ts-field" id="tsWCust"><label>Customer <b>*</b></label><input id="tsFCust" list="tsCustList" placeholder="Search account or name…" value="' + esc(a.custCode ? (a.custCode + ' — ' + (a.custName || '')) : '') + '" oninput="TS.recalc()" autocomplete="off"><datalist id="tsCustList">' + custOptions + '</datalist><span id="tsFCustNote" class="ts-fnote"></span></div>' +
        '<div class="ts-field"><label>Distributor</label><input id="tsFDist" value="' + esc(a.distributor || '') + '" placeholder="e.g. Relia"></div>' +
        '</div>' +
        '<div class="ts-field" id="tsWCats" style="margin-top:12px;"><label>Categories <b>*</b></label><div class="ts-chips" id="tsCatChips"></div><span id="tsFCatsErr"></span></div>' +
        '<div class="ts-field" style="margin-top:12px;"><label>SKUs <span class="ts-lbl-soft">(optional — narrows sales attribution to the selected items)</span></label>' +
        '<div class="ts-skupanel">' +
        '<div class="ts-sku-head"><input class="ts-sku-search" id="tsSkuSearch" placeholder="🔎 Search SKUs…" oninput="TS.onSkuSearch(this.value)" autocomplete="off">' +
        '<span class="ts-sku-count" id="tsSkuCount"></span><button type="button" class="ts-sku-clear" onclick="TS.clearSkus()">Clear all</button></div>' +
        '<div class="ts-sku-sel" id="tsSkuSel"></div>' +
        '<div class="ts-sku-list" id="tsSkuBox"></div>' +
        '</div></div>') +

      sec(2, 'Activity &amp; Investment',
        '<div class="ts-form-grid">' +
        '<div class="ts-field" id="tsWType"><label>Activity Type <b>*</b></label><select id="tsFType" onchange="TS.onTypeChange()">' + typeOptions(a.actType) + '</select><input id="tsFTypeCustom" placeholder="Custom type…" style="display:none;margin-top:6px;" onchange="TS.recalc()"></div>' +
        '<div class="ts-field" id="tsWDate"><label>Activity Date <b>*</b></label><input type="date" id="tsFDate" value="' + esc(a.activityDate || todayStr()) + '" onchange="TS.recalc()"><span id="tsFDateNote" class="ts-fnote"></span></div>' +
        '<div class="ts-field" id="tsWAmount"><label>Total Amount (SAR, excl. VAT) <b>*</b></label><input type="number" id="tsFAmount" min="0" step="0.01" value="' + (a.totalAmount != null ? a.totalAmount : '') + '" oninput="TS.onAmount()"></div>' +
        '<div class="ts-field"><label>Cost Split — Relia <span id="tsFSplitL">' + pct + '%</span> / Roshen <span id="tsFSplitR">' + (100 - pct) + '%</span></label>' +
        '<input type="range" id="tsFSplit" min="0" max="100" step="5" value="' + pct + '" oninput="TS.onSplit()">' +
        '<div class="ts-split-note"><span id="tsFSplitLA">Relia —</span><span id="tsFSplitRA">Roshen —</span></div></div>' +
        '<div class="ts-field"><label>Floor Displays #</label><input type="number" id="tsFNumFD" min="0" value="' + (a.numFloorDisplays != null ? a.numFloorDisplays : '') + '"></div>' +
        '<div class="ts-field"><label>Meters</label><input type="number" id="tsFMeters" min="0" step="0.1" value="' + (a.metersValue != null ? a.metersValue : '') + '"></div>' +
        '<div class="ts-field"><label>Branches #</label><input type="number" id="tsFNumBr" min="0" value="' + (a.numBranches != null ? a.numBranches : '') + '"></div>' +
        '</div>') +

      sec(3, 'Execution &amp; Claim',
        '<div class="ts-form-grid">' +
        '<div class="ts-field"><label>Execution Status</label><select id="tsFExec">' +
        ['Not Executed', 'Partially Executed', 'Fully Executed'].map(function (s) { return '<option' + (s === (a.execStatus || 'Not Executed') ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
        '<div class="ts-field"><label>Claim Received</label><div style="display:flex;gap:8px;align-items:center;">' +
        '<select id="tsFClaim" style="max-width:110px;" onchange="TS.onClaim()">' + ['No', 'Yes'].map(function (s) { return '<option' + (s === getClaim(a) ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
        '<input id="tsFClaimRef" placeholder="Claim reference…" value="' + esc(a.claimRef || '') + '" style="' + (getClaim(a) === 'Yes' ? '' : 'display:none;') + '"></div></div>' +
        '<div class="ts-field"><label>Execution Photos</label><input type="file" id="tsFPhotos" accept="image/*" multiple onchange="TS.onPhotos(this)"><div id="tsFPhotoList" class="ts-photo-grid"></div></div>' +
        '<div class="ts-field"><label>Credit Note</label><input type="file" id="tsFCn" accept="image/*,.pdf" onchange="TS.onCreditNote(this)"><div id="tsFCnName" style="font-size:11px;color:var(--text-muted);margin-top:4px;">' + esc(a.creditNoteFilename || '') + '</div></div>' +
        '</div>' +
        '<div class="ts-field" style="margin-top:10px;"><label>Notes</label><textarea id="tsFNotes" rows="3" style="width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);padding:9px 12px;font:inherit;">' + esc(a.notes || '') + '</textarea></div>') +

      sec(4, 'Performance Preview <span class="ts-live-dot" title="Recalculates live from the Dashboard sales data as you type"></span><span class="ts-lbl-soft" style="text-transform:none;letter-spacing:0;">auto-computed from live sales data</span>',
        '<div class="ts-perf-box" id="tsPerfBox">' +
        perfCell('Sales Before', 'tsPerfPre', 'tsPerfPreW') +
        perfCell('Baseline', 'tsPerfBase', 'tsPerfBaseW') +
        perfCell('Sales During', 'tsPerfPost', 'tsPerfPostW') +
        perfCell('Sales After', 'tsPerfAfter', 'tsPerfAfterW') +
        perfCell('Incremental', 'tsPerfInc') +
        perfCell('Uplift', 'tsPerfUplift') +
        perfCell('ROI (net)', 'tsPerfRoi') +
        perfCell('ROTS', 'tsPerfRots') +
        perfCell('Trade Spend %', 'tsPerfSpendPct') +
        perfCell('Verdict', 'tsPerfVerdict') +
        '<div class="ts-perf-note" id="tsPerfNote"></div>' +
        '</div>') +

      '<div style="display:flex;gap:10px;margin-top:16px;">' +
      '<button class="btn btn-primary" onclick="TS.saveActivity()">💾 ' + (state.editingId ? 'Save Changes' : 'Save Activity') + '</button>' +
      '<button class="btn" onclick="TS.resetForm()">Reset</button>' +
      '</div></div>';
    renderCatChips();
    renderSkuBox();
    renderFormPhotos();
    onAmount();
    recalc();
  }

  function skusByCat() {
    // [{cat, skus:[names]}] for the currently selected categories (or all).
    if (!datasetReady()) return [];
    var catSet = resolveCatIdxSet(state.formCats);
    var groups = {};
    SKUS.forEach(function (s) {
      if (catSet && !catSet.has(s.c)) return;
      var cat = DIMS.categories[s.c] || 'Other';
      (groups[cat] = groups[cat] || []).push(s.d);
    });
    return Object.keys(groups).sort().map(function (cat) {
      return { cat: cat, skus: groups[cat].sort() };
    });
  }

  function renderCatChips() {
    var el = byId('tsCatChips'); if (!el) return;
    var cats = salesCategories();
    var counts = {};
    if (datasetReady()) SKUS.forEach(function (s) { var c = DIMS.categories[s.c]; counts[c] = (counts[c] || 0) + 1; });
    el.innerHTML = ['<label class="ts-chip' + (isAllCats(state.formCats) ? ' on' : '') + '"><input type="checkbox" ' + (isAllCats(state.formCats) ? 'checked' : '') + ' onchange="TS.toggleAllCats(this.checked)">⭐ All Categories</label>']
      .concat(cats.map(function (c) {
        var on = !isAllCats(state.formCats) && state.formCats.indexOf(c) >= 0;
        return '<label class="ts-chip' + (on ? ' on' : '') + '"><input type="checkbox" ' + (on ? 'checked' : '') + ' onchange="TS.toggleCat(' + JSON.stringify(c).replace(/"/g, '&quot;') + ', this.checked)">' + esc(c) + ' <span class="ts-cat-count">' + (counts[c] || 0) + '</span></label>';
      })).join('');
  }

  var SKU_BATCH = 120; // rows rendered per group before "Show more" (windowed rendering)
  function renderSkuBox() {
    var box = byId('tsSkuBox'), selEl = byId('tsSkuSel'), cntEl = byId('tsSkuCount');
    if (!box) return;
    var q = (state.skuSearch || '').toLowerCase();
    var groups = skusByCat();
    if (!state.formCats.length) {
      box.innerHTML = '<div class="ts-sku-empty">Select categories above first (or ⭐ All Categories) — the SKU list follows your category selection.</div>';
      if (selEl) selEl.innerHTML = ''; if (cntEl) cntEl.textContent = '';
      return;
    }
    var totalShown = 0, html = '';
    groups.forEach(function (g) {
      var matches = q ? g.skus.filter(function (s) { return s.toLowerCase().indexOf(q) >= 0; }) : g.skus;
      if (!matches.length) return;
      var selInGroup = matches.filter(function (s) { return state.formSkus.indexOf(s) >= 0; }).length;
      var cap = state.skuShown[g.cat] || SKU_BATCH;
      var shown = matches.slice(0, cap);
      totalShown += matches.length;
      html += '<div class="ts-sku-group"><div class="ts-sku-gh">' + esc(g.cat) +
        ' <span class="ts-cat-count">' + selInGroup + '/' + matches.length + '</span>' +
        '<span class="ga" data-gsel="' + esc(g.cat) + '">' + (selInGroup === matches.length ? 'Clear group' : 'Select all') + '</span></div>' +
        shown.map(function (s) {
          var on = state.formSkus.indexOf(s) >= 0;
          return '<label class="ts-sku-row"><input type="checkbox" data-sku="' + esc(s) + '"' + (on ? ' checked' : '') + '> ' + esc(s) + '</label>';
        }).join('') +
        (matches.length > cap ? '<div class="ts-sku-more" data-more="' + esc(g.cat) + '">Show ' + (matches.length - cap) + ' more…</div>' : '') +
        '</div>';
    });
    box.innerHTML = html || '<div class="ts-sku-empty">No SKUs match “' + esc(state.skuSearch) + '”.</div>';
    if (cntEl) cntEl.textContent = state.formSkus.length ? state.formSkus.length + ' selected' : 'All SKUs in the selected categories';
    if (selEl) selEl.innerHTML = state.formSkus.length
      ? state.formSkus.map(function (s) { return '<span class="ts-sku-selchip">' + esc(s) + '<button type="button" data-unsku="' + esc(s) + '" title="Remove">✕</button></span>'; }).join('')
      : '<span class="ts-sku-selnone">No specific SKUs selected — performance uses every SKU in the selected categories.</span>';
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
    renderCatChips(); renderSkuBox(); recalc();
  }
  function toggleCat(name, on) {
    if (isAllCats(state.formCats)) state.formCats = [];
    var i = state.formCats.indexOf(name);
    if (on && i < 0) state.formCats.push(name);
    if (!on && i >= 0) state.formCats.splice(i, 1);
    state.formSkus = state.formSkus.filter(function (s) { return skusForCats(state.formCats).indexOf(s) >= 0; });
    renderCatChips(); renderSkuBox(); recalc();
  }
  function toggleSku(name, on) {
    var i = state.formSkus.indexOf(name);
    if (on && i < 0) state.formSkus.push(name);
    if (!on && i >= 0) state.formSkus.splice(i, 1);
    renderSkuBox(); recalc();
  }
  var _skuSearchT = null;
  function onSkuSearch(v) {
    clearTimeout(_skuSearchT);
    _skuSearchT = setTimeout(function () { state.skuSearch = v || ''; state.skuShown = {}; renderSkuBox(); }, 120);
  }
  function clearSkus() { state.formSkus = []; renderSkuBox(); recalc(); }
  function skuGroupSelect(cat) {
    var q = (state.skuSearch || '').toLowerCase();
    var g = skusByCat().find(function (x) { return x.cat === cat; });
    if (!g) return;
    var matches = q ? g.skus.filter(function (s) { return s.toLowerCase().indexOf(q) >= 0; }) : g.skus;
    var allOn = matches.every(function (s) { return state.formSkus.indexOf(s) >= 0; });
    if (allOn) state.formSkus = state.formSkus.filter(function (s) { return matches.indexOf(s) < 0; });
    else matches.forEach(function (s) { if (state.formSkus.indexOf(s) < 0) state.formSkus.push(s); });
    renderSkuBox(); recalc();
  }
  // Delegated events for the (re-rendered) SKU panel — wired once in init().
  function onFormClick(e) {
    var t = e.target;
    if (t.dataset && t.dataset.unsku != null) { toggleSku(t.dataset.unsku, false); return; }
    if (t.dataset && t.dataset.gsel != null) { skuGroupSelect(t.dataset.gsel); return; }
    if (t.dataset && t.dataset.more != null) {
      state.skuShown[t.dataset.more] = (state.skuShown[t.dataset.more] || SKU_BATCH) + SKU_BATCH;
      renderSkuBox(); return;
    }
  }
  function onFormChange(e) {
    var t = e.target;
    if (t.dataset && t.dataset.sku != null) toggleSku(t.dataset.sku, t.checked);
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

  function custResolved(code) {
    if (!code || !datasetReady()) return false;
    var idx = salesIndex();
    return !!(idx && (idx.idByAcct.get(code) || []).length);
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
      var set = function (id, v, cls) {
        var el = byId(id); if (!el) return;
        el.textContent = v;
        if (cls !== undefined) el.className = el.className.split(' ').filter(function (c) { return c.indexOf('c-') !== 0; }).join(' ') + (cls ? ' ' + cls : '');
      };
      var note = function (id, text, warn) {
        var el = byId(id); if (!el) return;
        el.textContent = text || '';
        el.style.color = warn ? 'var(--amber)' : 'var(--green)';
      };
      // Live customer resolution feedback
      var typed = (byId('tsFCust') && byId('tsFCust').value.trim()) || '';
      if (!typed) note('tsFCustNote', '');
      else if (custResolved(custCode)) note('tsFCustNote', '✓ ' + (formCustName() || custCode) + ' — sales data found');
      else note('tsFCustNote', '⚠ Account “' + custCode + '” not found in the sales data — pick an account from the list', true);
      // Live date sanity feedback
      var dateWarn = '';
      if (dateStr) {
        var today = todayStr();
        var yearAhead = new Date(); yearAhead.setFullYear(yearAhead.getFullYear() + 1);
        if (dateStr > yearAhead.toISOString().slice(0, 10)) dateWarn = '⚠ Date is more than a year ahead — check the year';
        else if (typeof META !== 'undefined' && META && META.dateMax && dateStr > META.dateMax) dateWarn = 'ℹ Beyond the latest sales import (' + META.dateMax + ') — performance stays Pending until data arrives';
        else if (dateStr > today) dateWarn = 'ℹ Future activity — performance will build up as sales data arrives';
      }
      note('tsFDateNote', dateWarn, dateWarn.indexOf('⚠') === 0);

      var ids = ['tsPerfPre', 'tsPerfBase', 'tsPerfPost', 'tsPerfAfter', 'tsPerfInc', 'tsPerfUplift', 'tsPerfRoi', 'tsPerfRots', 'tsPerfSpendPct', 'tsPerfVerdict'];
      var subs = ['tsPerfPreW', 'tsPerfBaseW', 'tsPerfPostW', 'tsPerfAfterW'];
      if (!custCode || !cats.length || !dateStr) {
        ids.forEach(function (id) { set(id, '—'); });
        subs.forEach(function (id) { set(id, ''); });
        set('tsPerfNote', 'Select a customer, categories and a date — every figure below computes automatically from the Dashboard sales data.');
        return;
      }
      if (!datasetReady()) { set('tsPerfNote', 'Sales dataset not loaded yet.'); return; }
      var p = computePerf(custCode, cats, state.formSkus, actType, dateStr, state.editingId, total);
      set('tsPerfPre', fmtSAR(p.preAmount));
      set('tsPerfPreW', p.periods.preStartDateStr + ' → ' + p.periods.preEndDateStr + ' · ' + p.preDaysCovered + 'd data');
      set('tsPerfBase', fmtSAR(p.baselineAmount));
      set('tsPerfBaseW', p.baselineAmount != null ? 'daily rate × during days' + (p.baselineFloored ? ' (floored)' : '') : '');
      set('tsPerfPost', fmtSAR(p.postAmount));
      set('tsPerfPostW', p.periods.postStartDateStr + ' → ' + p.periods.postEndDateStr + ' · ' + p.postDaysCovered + '/' + p.periods.postDays + 'd data');
      set('tsPerfAfter', p.afterDaysCovered > 0 ? fmtSAR(p.afterAmount) : '—');
      set('tsPerfAfterW', p.afterDaysCovered > 0 ? (p.periods.afterStartDateStr + ' → ' + p.periods.afterEndDateStr + (p.retention != null ? ' · ' + fmtPct(p.retention) + ' retention' : '')) : (p.periods.afterBlocked ? 'blocked by next activity' : 'no data yet'));
      set('tsPerfInc', fmtSAR(p.incremental));
      set('tsPerfUplift', p.upliftNew ? 'New listing' : fmtPct(p.uplift));
      set('tsPerfRoi', fmtPct(p.roi));
      set('tsPerfRots', p.rots != null ? p.rots.toFixed(2) + '×' : '—');
      set('tsPerfSpendPct', fmtPct(p.spendPct));
      set('tsPerfVerdict', total > 0 ? p.verdict : 'Pending');
      var notes = [];
      if (!(total > 0)) notes.push('Enter the spend amount to get ROI and a verdict.');
      if (p.postDaysCovered === 0) notes.push('<span class="warn">Awaiting sales data for the activity period — verdict stays Pending.</span>');
      if (p.periods.truncatedBy) notes.push('Measurement window ends the day before ' + esc(p.periods.truncatedBy) + ' (next activity for this customer/scope).');
      if (p.overlaps && p.overlaps.length) notes.push('<span class="warn">⚠ Overlaps ' + esc(p.overlaps.join(', ')) + ' — incremental sales will be shared.</span>');
      if (p.baselineFloored) notes.push('Before-period is returns-heavy; baseline floored at 0.');
      var el = byId('tsPerfNote'); if (el) el.innerHTML = notes.join(' ');
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

    // Field-level validation — errors shown inline at the field, not only a toast.
    ['tsWCust', 'tsWCats', 'tsWType', 'tsWDate', 'tsWAmount'].forEach(function (id) {
      var w = byId(id); if (!w) return;
      w.classList.remove('err');
      var e = w.querySelector('.ts-ferr'); if (e) e.remove();
    });
    var errors = [];
    var fieldErr = function (wrapId, msg) {
      errors.push(msg);
      var w = byId(wrapId); if (!w) return;
      w.classList.add('err');
      var e = document.createElement('span'); e.className = 'ts-ferr'; e.textContent = msg;
      w.appendChild(e);
    };
    if (!custCode) fieldErr('tsWCust', 'Customer is required.');
    else if (datasetReady() && !custResolved(custCode)) fieldErr('tsWCust', 'Account “' + custCode + '” is not in the sales data — pick an account from the list so performance can be attributed.');
    if (!state.formCats.length) fieldErr('tsWCats', 'Select at least one category (or ⭐ All Categories).');
    if (!actType) fieldErr('tsWType', 'Activity type is required.');
    if (!dateStr) fieldErr('tsWDate', 'Activity date is required.');
    else {
      var yearAhead = new Date(); yearAhead.setFullYear(yearAhead.getFullYear() + 1);
      if (dateStr > yearAhead.toISOString().slice(0, 10)) fieldErr('tsWDate', 'Date is more than a year ahead — check the year.');
    }
    if (!(total > 0)) fieldErr('tsWAmount', 'Total amount must be greater than zero.');
    if (errors.length) {
      toast(errors[0], true);
      var firstErr = document.querySelector('#tsFormHost .ts-field.err');
      if (firstErr && firstErr.scrollIntoView) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

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
    // Performance is ALWAYS computed from the latest Dashboard sales dataset —
    // stored figures are just the last-saved snapshot of that computation.
    var perf = datasetReady() ? computePerf(custCode, state.formCats, state.formSkus, actType, dateStr, state.editingId, total) : null;

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
      a.baselineAmount = perf.baselineAmount;
      a.preDaysCovered = perf.preDaysCovered; a.postDaysCovered = perf.postDaysCovered;
      a.afterAmount = perf.afterAmount; a.afterDaysCovered = perf.afterDaysCovered;
      a.incremental = perf.incremental;
      a.uplift = perf.uplift; a.roi = perf.roi; a.verdict = perf.verdict;
      a.rots = perf.rots; a.spendPct = perf.spendPct; a.retention = perf.retention;
      // provenance stamp for audit: when and by whom figures were (re)computed
      a.perfSource = 'dashboard-dataset';
      a.perfCalculatedAt = new Date().toISOString();
      a.perfCalculatedBy = currentUserEmail();
      delete a.perfPreserved;
    }
    a.overallStatus = computeOverall(a);
    a.updatedBy = currentUserEmail();
    a.updatedAt = new Date().toISOString();

    if (STD_TYPES.indexOf(actType) < 0 && state.customTypes.indexOf(actType) < 0) state.customTypes.push(actType);

    var ok = await persistActivity(a);
    if (!ok) return;
    if (!editing) state.activities.push(a);
    _livePerfCache.clear(); // this activity may truncate neighbours' windows
    toast((editing ? 'Saved changes to ' : 'Created ') + a.id);
    state.editingId = null;
    state.formSeededFor = null; // next form open starts fresh
    switchTab('log');
  }

  function editActivity(id) {
    var a = findAct(id); if (!a) return;
    if (!canEditRow(a)) { toast('This record is locked for you.', true); return; }
    state.editingId = id;
    switchTab('new');
  }
  function cancelEdit() { state.editingId = null; state.formSeededFor = null; renderForm(); }
  function resetForm() { state.formSeededFor = null; renderForm(); }

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
      '<div class="card"><div class="card-header"><div class="card-title"><span class="icon-bullet"></span> Spend vs Incremental by Category</div></div><div class="chart-container"><canvas id="tsChartCat"></canvas></div></div>' +
      '<div class="card"><div class="card-header"><div class="card-title"><span class="icon-bullet"></span> ROI by Activity Type</div></div><div class="chart-container"><canvas id="tsChartRoi"></canvas></div></div>' +
      '</div>' +
      '<div class="chart-row cols-2-eq">' +
      '<div class="card"><div class="card-header"><div class="card-title"><span class="icon-bullet"></span> Verdicts</div></div><div class="chart-container"><canvas id="tsChartVerdict"></canvas></div></div>' +
      '<div class="card"><div class="card-header"><div class="card-title"><span class="icon-bullet"></span> Relia / Roshen Split</div></div><div class="chart-container"><canvas id="tsChartSplit"></canvas></div></div>' +
      '</div>' +
      '<div class="chart-row cols-2-eq">' +
      '<div class="card"><div class="card-header"><div class="card-title"><span class="icon-bullet"></span> Claims Recovery (spend)</div></div><div class="chart-container"><canvas id="tsChartClaims"></canvas></div></div>' +
      '<div class="card"><div class="card-header"><div class="card-title"><span class="icon-bullet"></span> Execution Status</div></div><div class="chart-container"><canvas id="tsChartExec"></canvas></div></div>' +
      '</div>';
    if (typeof Chart === 'undefined') return;
    var byCat = {}, incByCat = {}, roiByType = {}, verdicts = {}, splitTotals = { Relia: 0, Roshen: 0 };
    var claims = { claimed: 0, unclaimed: 0 }, execCounts = {};
    acts.forEach(function (a) {
      var dp = displayPerf(a); // live figures from the current dataset
      var label = isAllCats(getCats(a)) ? 'All Categories' : getCats(a).join(', ');
      byCat[label] = (byCat[label] || 0) + num(a.totalAmount);
      incByCat[label] = (incByCat[label] || 0) + (dp.inc != null && isFinite(dp.inc) ? dp.inc : 0);
      if (dp.roi != null && a.actType) {
        (roiByType[a.actType] = roiByType[a.actType] || []).push(dp.roi);
      }
      var v = dp.verdict || 'Pending';
      verdicts[v] = (verdicts[v] || 0) + 1;
      splitTotals.Relia += num(a.reliaAmount);
      splitTotals.Roshen += num(a.roshenAmount);
      claims[getClaim(a) === 'Yes' ? 'claimed' : 'unclaimed'] += num(a.totalAmount);
      var ex = a.execStatus || 'Not Executed';
      execCounts[ex] = (execCounts[ex] || 0) + 1;
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
    var withLegend = { plugins: { legend: { position: 'bottom', labels: { color: textCol } } }, responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: textCol } }, y: { ticks: { color: textCol } } } };
    var catLabels = Object.keys(byCat);
    mk('tsChartCat', { type: 'bar', data: { labels: catLabels, datasets: [
      { label: 'Spend', data: catLabels.map(function (c) { return Math.round(byCat[c]); }), backgroundColor: accent, borderRadius: 6 },
      { label: 'Incremental', data: catLabels.map(function (c) { return Math.round(incByCat[c]); }), backgroundColor: blue, borderRadius: 6 }
    ] }, options: withLegend });
    var roiLabels = Object.keys(roiByType);
    var roiVals = roiLabels.map(function (t) { var xs = roiByType[t]; return xs.reduce(function (s, x) { return s + x; }, 0) / xs.length * 100; });
    mk('tsChartRoi', { type: 'bar', data: { labels: roiLabels, datasets: [{ data: roiVals, backgroundColor: roiVals.map(function (v) { return v >= 20 ? green : (v >= 0 ? amber : red); }), borderRadius: 6 }] }, options: noLegend });
    mk('tsChartVerdict', { type: 'doughnut', data: { labels: Object.keys(verdicts), datasets: [{ data: Object.values(verdicts), backgroundColor: [green, amber, red, textCol] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: textCol } } } } });
    mk('tsChartSplit', { type: 'doughnut', data: { labels: ['Relia', 'Roshen'], datasets: [{ data: [splitTotals.Relia, splitTotals.Roshen], backgroundColor: [blue, accent] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: textCol } } } } });
    mk('tsChartClaims', { type: 'doughnut', data: { labels: ['Claim received', 'Not yet claimed'], datasets: [{ data: [claims.claimed, claims.unclaimed], backgroundColor: [green, amber] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: textCol } } } } });
    mk('tsChartExec', { type: 'doughnut', data: { labels: Object.keys(execCounts), datasets: [{ data: Object.values(execCounts), backgroundColor: [textCol, amber, green] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: textCol } } } } });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // EXPORTS — Excel (native XLSX already loaded) + PDF (lazy jsPDF, legacy parity)
  // ───────────────────────────────────────────────────────────────────────────
  function exportExcel() {
    if (!can('ts.export')) { toast('You do not have export permission.', true); return; }
    if (!state.activities.length) { toast('No activities to export.', true); return; }
    if (typeof XLSX === 'undefined') { toast('Excel library not loaded yet — try again in a moment.', true); return; }
    var data = state.activities.map(function (a) {
      var dp = displayPerf(a); // live figures from the current dataset
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
        'Post Period Start': dp.postStart || a.startDate,
        'Post Period End': dp.postEnd || a.endDate,
        'Post Duration (days)': dp.days,
        'Truncated By Next Activity': dp.trunc || '',
        'Total Amount (SAR)': a.totalAmount,
        'Relia %': a.reliaPct,
        'Relia Amount (SAR)': a.reliaAmount,
        'Roshen %': a.roshenPct,
        'Roshen Amount (SAR)': a.roshenAmount,
        'Sales Before (SAR)': dp.pre,
        'Sales During (SAR)': dp.post,
        'Sales After (SAR)': dp.afterCov ? dp.after : '',
        'Cases Before': dp.preCases,
        'Cases During': dp.postCases,
        'Baseline (SAR)': dp.baseline != null ? Math.round(dp.baseline) : '',
        'Incremental (SAR)': dp.inc,
        'Uplift %': dp.uplift != null ? (dp.uplift * 100).toFixed(2) + '%' : '',
        'ROI %': dp.roi != null ? (dp.roi * 100).toFixed(2) + '%' : '',
        'ROTS (x)': dp.rots != null ? dp.rots.toFixed(2) : '',
        'Trade Spend % of During Sales': dp.spendPct != null ? (dp.spendPct * 100).toFixed(2) + '%' : '',
        'Discount % (During)': dp.postDiscountPct != null ? (dp.postDiscountPct * 100).toFixed(2) + '%' : '',
        'Post-promo Retention %': dp.retention != null ? (dp.retention * 100).toFixed(2) + '%' : '',
        'Verdict': dp.verdict,
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
        'Updated': a.updatedAt,
        'Pre Days Covered': dp.preCov != null ? dp.preCov : '',
        'During Days Covered': dp.postCov != null ? dp.postCov : '',
        'After Days Covered': dp.afterCov != null ? dp.afterCov : ''
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
    // Delegated row-action handler — bound once on the static view container,
    // survives table re-renders, reliable on touch browsers.
    var view = byId('view-tradespend');
    if (view && !view._tsActBound) {
      view._tsActBound = true;
      view.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.ts-act-btn[data-act]') : null;
        if (!btn || btn.disabled) return;
        e.preventDefault();
        handleAction(btn.getAttribute('data-act'), btn.getAttribute('data-id'));
      });
    }
    var modal = byId('tsModal');
    if (modal && !modal._tsBound) {
      modal._tsBound = true;
      modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(); });
    }
    // Delegated SKU-panel events (the panel re-renders; the host doesn't).
    var formHost = byId('tsFormHost');
    if (formHost && !formHost._tsBound) {
      formHost._tsBound = true;
      formHost.addEventListener('click', onFormClick);
      formHost.addEventListener('change', onFormChange);
    }
    injectStylesV2();
    startFreshnessWatch();
  }

  // ── Stale-tab detection ────────────────────────────────────────────────────
  // A dashboard tab left open across a deployment keeps running the OLD code
  // until reloaded — users then report "the new version isn't live". Compare
  // the server's ETag against the one this tab booted with (checked every
  // 5 minutes and whenever the tab regains focus) and offer a one-click
  // refresh when a newer build is on the server.
  var _bootEtag = null, _freshTimer = null;
  function checkFreshness() {
    if (typeof location === 'undefined' || typeof fetch === 'undefined' ||
        location.protocol.indexOf('http') !== 0) return; // file:// and test rigs
    try {
      fetch(location.pathname || '/', { method: 'HEAD', cache: 'no-store' }).then(function (r) {
        var e = r.headers.get('etag');
        if (!e) return;
        if (_bootEtag === null) { _bootEtag = e; return; }
        if (e !== _bootEtag) showUpdateBanner();
      }).catch(function () {});
    } catch (e) {}
  }
  function showUpdateBanner() {
    if (byId('tsUpdateBanner')) return;
    var el = document.createElement('div');
    el.id = 'tsUpdateBanner';
    el.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99999;display:flex;gap:12px;align-items:center;padding:11px 16px;border-radius:12px;background:#1A2942;color:#F1F4FA;border:1px solid rgba(255,255,255,0.15);box-shadow:0 10px 40px rgba(0,0,0,0.45);font:600 12.5px/1.4 Calibri,system-ui,sans-serif;';
    el.innerHTML = '⬆️ A newer version of the dashboard has been deployed.' +
      '<button style="all:unset;cursor:pointer;background:#C2263B;color:#fff;font-weight:800;padding:6px 14px;border-radius:8px;" onclick="location.reload()">Refresh now</button>';
    document.body.appendChild(el);
  }
  function startFreshnessWatch() {
    if (_freshTimer) return;
    checkFreshness(); // records the boot ETag
    _freshTimer = setInterval(checkFreshness, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) checkFreshness(); });
  }

  function injectStylesV2() {
    if (byId('tsStylesV2')) return;
    var css =
      '#view-tradespend .ts-sec{margin-top:16px;padding:16px 18px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-elevated,transparent);}' +
      '#view-tradespend .ts-sec-t{display:flex;align-items:center;gap:9px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:13px;}' +
      '#view-tradespend .ts-sec-n{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--gold);color:#fff;font-size:11px;font-weight:800;}' +
      '#view-tradespend .ts-lbl-soft{font-weight:500;color:var(--text-muted);text-transform:none;letter-spacing:0;}' +
      '#view-tradespend .ts-field label b{color:var(--gold);}' +
      '#view-tradespend .ts-field.err input,#view-tradespend .ts-field.err select,#view-tradespend .ts-field.err .ts-skupanel,#view-tradespend .ts-field.err .ts-chips{border-color:var(--red)!important;box-shadow:0 0 0 1px var(--red);border-radius:var(--radius-sm);}' +
      '#view-tradespend .ts-ferr{display:block;font-size:10.5px;color:var(--red);margin-top:5px;font-weight:700;}' +
      '#view-tradespend .ts-fnote{display:block;font-size:10.5px;margin-top:5px;font-weight:600;min-height:14px;}' +
      '#view-tradespend .ts-skupanel{border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-input,var(--bg-card));overflow:hidden;}' +
      '#view-tradespend .ts-sku-head{display:flex;gap:10px;align-items:center;padding:9px 11px;border-bottom:1px solid var(--border);flex-wrap:wrap;}' +
      '#view-tradespend .ts-sku-search{flex:1;min-width:170px;background:var(--bg-deep,transparent);border:1px solid var(--border);border-radius:7px;color:var(--text-primary);padding:7px 11px;font-size:12px;outline:none;}' +
      '#view-tradespend .ts-sku-search:focus{border-color:var(--gold);}' +
      '#view-tradespend .ts-sku-count{font-size:10.5px;color:var(--text-muted);font-weight:600;white-space:nowrap;}' +
      '#view-tradespend .ts-sku-clear{background:none;border:1px solid var(--border);border-radius:7px;color:var(--text-secondary);font-size:10.5px;font-weight:700;padding:5px 10px;cursor:pointer;}' +
      '#view-tradespend .ts-sku-clear:hover{border-color:var(--red);color:var(--red);}' +
      '#view-tradespend .ts-sku-sel{display:flex;gap:6px;flex-wrap:wrap;padding:9px 11px;border-bottom:1px dashed var(--border);min-height:20px;}' +
      '#view-tradespend .ts-sku-selchip{display:inline-flex;align-items:center;gap:6px;padding:3px 8px 3px 11px;border-radius:100px;background:rgba(232,93,111,0.10);border:1px solid var(--gold);color:var(--gold);font-size:11px;font-weight:700;}' +
      '#view-tradespend .ts-sku-selchip button{all:unset;cursor:pointer;font-weight:800;padding:0 3px;line-height:1;}' +
      '#view-tradespend .ts-sku-selnone{font-size:11px;color:var(--text-muted);}' +
      '#view-tradespend .ts-sku-list{max-height:270px;overflow-y:auto;padding:2px 0 6px;}' +
      '#view-tradespend .ts-sku-gh{display:flex;align-items:center;gap:8px;padding:8px 12px 5px;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);position:sticky;top:0;background:var(--bg-input,var(--bg-card));z-index:1;}' +
      '#view-tradespend .ts-sku-gh .ga{margin-left:auto;font-size:10px;color:var(--gold);cursor:pointer;font-weight:800;user-select:none;}' +
      '#view-tradespend .ts-sku-row{display:flex;align-items:center;gap:9px;padding:6px 14px;font-size:12px;color:var(--text-secondary);cursor:pointer;}' +
      '#view-tradespend .ts-sku-row:hover{background:rgba(255,255,255,0.045);color:var(--text-primary);}' +
      '#view-tradespend .ts-sku-row input{accent-color:var(--gold);}' +
      '#view-tradespend .ts-sku-more{margin:5px 14px;font-size:11px;color:var(--gold);cursor:pointer;font-weight:700;user-select:none;}' +
      '#view-tradespend .ts-sku-empty{padding:14px;font-size:11.5px;color:var(--text-muted);}' +
      '#view-tradespend .ts-cat-count{opacity:.6;font-weight:600;font-size:10px;}' +
      '#view-tradespend .ts-perf-sub{font-size:9.5px;color:var(--text-muted);margin-top:3px;line-height:1.35;}' +
      '#view-tradespend .ts-perf-note{grid-column:1/-1;font-size:11px;color:var(--text-muted);line-height:1.5;}' +
      '#view-tradespend .ts-perf-note .warn{color:var(--amber);font-weight:600;}' +
      '#view-tradespend .ts-live-dot{width:8px;height:8px;border-radius:50%;background:var(--green);display:inline-block;box-shadow:0 0 0 3px rgba(43,182,115,0.2);}' +
      '#view-tradespend .ts-build-badge{display:inline-block;margin-left:8px;padding:2px 9px;border-radius:100px;border:1px solid var(--green);color:var(--green);font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;vertical-align:middle;}' +
      '@media (max-width:768px){#view-tradespend .ts-sec{padding:12px;}#view-tradespend .ts-sku-list{max-height:220px;}}';
    var el = document.createElement('style');
    el.id = 'tsStylesV2';
    el.textContent = css;
    document.head.appendChild(el);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public surface (used by inline handlers + shell integration)
  return {
    build: TS_BUILD,
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
    onSkuSearch: onSkuSearch,
    clearSkus: clearSkus,
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
    // exposed for validation tooling (M6 parity checks + business audit)
    _setActivitiesForTest: function (list) { state.activities = list || []; _livePerfCache.clear(); },
    _internals: { computeOverall: computeOverall, computePerf: computePerf, calcSalesForRange: calcSalesForRange, getPeriodForActivity: getPeriodForActivity, activityToRow: activityToRow, rowToActivity: rowToActivity, displayPerf: displayPerf, livePerf: livePerf, can: can, auth: auth }
  };
})();
