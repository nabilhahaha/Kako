/* AUTO-GENERATED — VERBATIM EXTRACT FROM THE REFERENCE IMPLEMENTATION. DO NOT EDIT.
 * Source: roshen_settlement_platform.html lines 5168–5243
 * Block sha256: d07401108d1c5dab29860685c0de613e4468422c00b8539299dce1971c9c8b0a
 * Regenerate: node scripts/extract-frozen-promotions.mjs
 * Verify:     node scripts/extract-frozen-promotions.mjs --check
 */
/* eslint-disable */
// @ts-nocheck
/* ===== BEGIN VERBATIM (extracted — do not modify) ===== */
    const hNorm = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
    const hLoose = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '');
    const REQUIRED_LABELS = ['Invoice', 'Cust Account', 'Cust Name', 'Invoice Date', 'Item Id', 'Item Description', 'Net Amount', 'Gross Sales value', 'Qty Cases'];
    const HEADER_ALIASES = {
      'Invoice': ['invoice', 'invoiceno', 'invoicenumber', 'invoicenbr', 'invno', 'invnum', 'invoiceid', 'billno', 'documentno', 'رقمالفاتورة'],
      'Cust Account': ['custaccount', 'customeraccount', 'custcode', 'customercode', 'customerid', 'custno', 'customerno', 'customernumber', 'accountcode', 'accountno', 'custid', 'كودالعميل', 'رقمالعميل'],
      'Cust Name': ['custname', 'customername', 'customer', 'custdescription', 'customerdescription', 'اسمالعميل'],
      'Invoice Date': ['invoicedate', 'invdate', 'date', 'billdate', 'transactiondate', 'postingdate', 'docdate', 'تاريخالفاتورة', 'التاريخ'],
      'Sales Man': ['salesman', 'salesrep', 'salesperson', 'salesmanname', 'repname', 'salesrepname', 'المندوب', 'اسمالمندوب'],
      'Channel': ['channel', 'saleschannel', 'القناة'],
      'City': ['city', 'المدينة'],
      'Region': ['region', 'المنطقة'],
      'Division': ['division'],
      'Item Id': ['itemid', 'itemcode', 'itemno', 'itemnumber', 'sku', 'skucode', 'productcode', 'productid', 'materialcode', 'material', 'كودالصنف', 'رقمالصنف'],
      'Item Description': ['itemdescription', 'itemdesc', 'itemname', 'productname', 'productdescription', 'materialdescription', 'description', 'اسمالصنف'],
      'Item Group': ['itemgroup', 'productgroup', 'itemcategory', 'category'],
      'SalesUnit': ['salesunit', 'unit', 'uom', 'salesuom', 'unitofmeasure'],
      'Qty Each': ['qtyeach', 'qtyea', 'eachqty', 'qtyunits', 'qtypcs', 'pcsqty', 'qtypieces', 'piecesqty', 'الكميةبالحبة'],
      'Qty Cases': ['qtycases', 'qtycase', 'casesqty', 'caseqty', 'cases', 'qtyctn', 'ctnqty', 'qtycartons', 'cartonsqty', 'cartonqty', 'qtyincases', 'الكميةبالكرتون'],
      'SalesUnitPrice': ['salesunitprice', 'unitprice', 'caseprice'],
      'EA Unit Price': ['eaunitprice', 'eaprice', 'unitpriceea', 'pieceprice', 'eachprice'],
      'Net Amount': ['netamount', 'netvalue', 'netsales', 'netsalesvalue', 'netsalesamount', 'netamt', 'صافيالمبيعات'],
      'Gross Sales value': ['grosssalesvalue', 'grossvalue', 'grosssales', 'grossamount', 'grosssalesamount', 'grossamt', 'gross', 'grosssalevalue', 'grosstotal', 'totalgross', 'salesvaluegross', 'اجماليالمبيعات', 'إجماليالمبيعات'],
      'IsReturn': ['isreturn', 'returnflag', 'isret'],
      'Price List Name': ['pricelistname', 'pricelist'],
      'Order Type': ['ordertype', 'documenttype', 'doctype'],
    };
    const ALIAS_TO_CANON = (() => {
      const m = {};
      Object.entries(HEADER_ALIASES).forEach(([canon, keys]) => { m[hLoose(canon)] = canon; keys.forEach(k => { if (!(k in m)) m[k] = canon; }); });
      return m;
    })();
    // Last-resort matching for required columns only — applied when a required
    // canonical is still missing and exactly ONE unclaimed header fits.
    const REQUIRED_HINTS = {
      'Gross Sales value': k => k.includes('gross') || k.includes('اجمالي') || k.includes('إجمالي'),
      'Net Amount': k => k.includes('net') && !k.includes('gross'),
      'Qty Cases': k => k.includes('case') || k.includes('ctn') || k.includes('carton') || k.includes('كرتون'),
      'Invoice': k => k.includes('invoice') && !k.includes('date'),
      'Invoice Date': k => k.includes('date') || k.includes('تاريخ'),
      'Cust Account': k => (k.includes('cust') || k.includes('customer')) && (k.includes('acc') || k.includes('code') || k.includes('id') || k.includes('no')),
      'Cust Name': k => (k.includes('cust') || k.includes('customer')) && k.includes('name'),
      'Item Id': k => (k.includes('item') || k.includes('product')) && (k.includes('id') || k.includes('code') || k.includes('no')),
      'Item Description': k => (k.includes('item') || k.includes('product')) && (k.includes('desc') || k.includes('name')),
    };
    function repairHeaders(rows) {
      if (!rows.length) return { rows, renamed: [], headers: [] };
      // Some exports put title/blank rows above the real header — pick the row
      // (within the first 15) that matches the most known column names.
      const rowScore = r => (r || []).reduce((n, h) => n + (ALIAS_TO_CANON[hLoose(h)] ? 1 : 0), 0);
      let hi = 0, best = rowScore(rows[0]);
      for (let i = 1; i < Math.min(rows.length, 15); i++) {
        const s = rowScore(rows[i]);
        if (s > best + 2) { best = s; hi = i; }
      }
      const out = hi > 0 ? rows.slice(hi) : rows.slice();
      const header = (out[0] || []).slice();
      const canonByNorm = {};
      Object.keys(HEADER_ALIASES).forEach(c => { canonByNorm[hNorm(c)] = c; });
      const present = new Set(), claimed = new Set(), renamed = [];
      header.forEach((h, i) => { const c = canonByNorm[hNorm(h)]; if (c) { present.add(c); claimed.add(i); } });
      header.forEach((h, i) => {
        if (claimed.has(i)) return;
        const c = ALIAS_TO_CANON[hLoose(h)];
        if (c && !present.has(c)) { renamed.push({ from: String(h), to: c }); header[i] = c; present.add(c); claimed.add(i); }
      });
      REQUIRED_LABELS.forEach(c => {
        if (present.has(c)) return;
        const hint = REQUIRED_HINTS[c]; if (!hint) return;
        const hits = [];
        header.forEach((h, i) => { if (!claimed.has(i) && String(h).trim() && hint(hLoose(h))) hits.push(i); });
        if (hits.length === 1) { const i = hits[0]; renamed.push({ from: String(header[i]), to: c }); header[i] = c; present.add(c); claimed.add(i); }
      });
      out[0] = header;
      return { rows: out, renamed, headers: ((rows[hi] || [])).map(h => String(h == null ? '' : h).trim()).filter(Boolean) };
    }
/* ===== END VERBATIM ===== */
export { repairHeaders, HEADER_ALIASES, REQUIRED_LABELS };