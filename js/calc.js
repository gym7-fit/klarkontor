/* Klarkontor – Rechenkern: Beträge in ganzen Cent, USt je Satz, Rabatt, Nummernkreise, Belegstatus, Mahnberechnung. */
(function (root, factory) {
  const U = (typeof module === 'object' && module.exports) ? require('./util.js') : root.KK.util;
  const api = factory(U);
  root.KK = root.KK || {};
  root.KK.calc = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function (U) {
  'use strict';

  /* Einheiten mit UN/ECE-Recommendation-20-Code (für die E-Rechnung) */
  const UNITS = [
    { key: 'stk', label: 'Stk.', code: 'H87' },
    { key: 'std', label: 'Std.', code: 'HUR' },
    { key: 'tag', label: 'Tag(e)', code: 'DAY' },
    { key: 'psch', label: 'pauschal', code: 'C62' },
    { key: 'monat', label: 'Monat(e)', code: 'MON' },
    { key: 'km', label: 'km', code: 'KMT' },
    { key: 'm', label: 'm', code: 'MTR' },
    { key: 'm2', label: 'm²', code: 'MTK' },
    { key: 'kg', label: 'kg', code: 'KGM' },
    { key: 'l', label: 'l', code: 'LTR' },
  ];
  const unitOf = key => UNITS.find(u => u.key === key) || UNITS[0];
  const VAT_RATES = [19, 7];

  // kaufmännisch runden (von null weg) für ganzzahlige Division
  function roundDiv(a, b) {
    const s = a < 0 ? -1 : 1;
    return s * Math.floor((Math.abs(a) + Math.floor(b / 2)) / b);
  }

  /* ---------- Beträge ---------- */
  function compute(doc) {
    const klein = !!doc.klein;
    const items = doc.items || [];
    const lines = items.map(it => {
      const qtyMilli = Math.round((Number(it.qty) || 0) * 1000);
      const price = Math.round(Number(it.price) || 0);
      const rate = klein ? 0 : (it.vat == null ? 19 : Number(it.vat));
      return { id: it.id, qtyMilli, price, rate, net: roundDiv(qtyMilli * price, 1000) };
    });
    const lineTotal = lines.reduce((s, l) => s + l.net, 0);

    const byRate = new Map();
    for (const l of lines) byRate.set(l.rate, (byRate.get(l.rate) || 0) + l.net);
    const groups = [...byRate.entries()].sort((a, b) => b[0] - a[0]).map(([rate, base]) => ({
      rate, cat: rate === 0 ? 'E' : 'S', base, allowance: 0, taxable: base, vat: 0,
    }));

    // Rabatt auf alle Gruppen verteilen
    const d = doc.discount;
    if (d && d.value && lineTotal !== 0) {
      if (d.mode === 'percent') {
        for (const g of groups) g.allowance = roundDiv(g.base * d.value, 10000);
      } else {
        const sign = lineTotal < 0 ? -1 : 1;
        const A = sign * Math.min(Math.abs(d.value), Math.abs(lineTotal));
        let rest = A;
        for (const g of groups) { g.allowance = roundDiv(A * g.base, lineTotal); rest -= g.allowance; }
        if (rest !== 0) {
          const big = groups.reduce((m, g) => (Math.abs(g.base) > Math.abs(m.base) ? g : m), groups[0]);
          big.allowance += rest;
        }
      }
    }
    for (const g of groups) {
      g.taxable = g.base - g.allowance;
      g.vat = roundDiv(g.taxable * g.rate, 100);
    }
    const allowanceTotal = groups.reduce((s, g) => s + g.allowance, 0);
    const net = lineTotal - allowanceTotal;
    const vat = groups.reduce((s, g) => s + g.vat, 0);
    const gross = net + vat;
    const paid = (doc.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return { klein, lines, groups, lineTotal, allowanceTotal, net, vat, gross, paid, open: gross - paid };
  }

  /* ---------- Nummernkreise ---------- */
  const validPattern = p => typeof p === 'string' && /\{N+\}/.test(p);
  function formatNumber(pattern, n, year) {
    return pattern.replace(/\{(Y{2,4}|N+)\}/g, (m, t) =>
      t[0] === 'Y' ? (t.length >= 4 ? String(year) : String(year).slice(-2)) : String(n).padStart(t.length, '0'));
  }
  const counterKey = (pattern, year) => (/\{Y{2,4}\}/.test(pattern) ? String(year) : 'all');
  function peekNumber(seq, year, existing) {
    const key = counterKey(seq.pattern, year);
    let n = ((seq.counters && seq.counters[key]) || 0) + 1;
    let number = formatNumber(seq.pattern, n, year);
    while (existing && existing.has(number)) { n++; number = formatNumber(seq.pattern, n, year); }
    return { number, n, key };
  }
  function takeNumber(seq, year, existing) {
    const r = peekNumber(seq, year, existing);
    seq.counters = seq.counters || {};
    seq.counters[r.key] = r.n;
    return r.number;
  }

  /* ---------- Belegstatus ---------- */
  const isInvoice = d => d.type === 'invoice';
  const isStorno = d => !!d.cancelsId;
  function docState(doc, todayIso) {
    const t = todayIso || U.today();
    if (doc.status === 'draft') return { key: 'draft', label: 'Entwurf', tone: 'neutral' };
    if (isInvoice(doc)) {
      if (doc.status === 'cancelled') return { key: 'cancelled', label: 'Storniert', tone: 'neutral' };
      if (isStorno(doc)) return { key: 'storno', label: 'Storno', tone: 'neutral' };
      const c = compute(doc);
      if (c.open <= 0) return { key: 'paid', label: 'Bezahlt', tone: 'good' };
      const late = doc.due && doc.due < t ? U.daysBetween(doc.due, t) : 0;
      if (late > 0) return { key: 'overdue', label: `Überfällig (${late} ${U.plural(late, 'Tag', 'Tage')})`, tone: 'bad', overdueDays: late };
      if (c.paid > 0) return { key: 'partial', label: 'Teilbezahlt', tone: 'info' };
      return { key: 'open', label: 'Offen', tone: 'info' };
    }
    if (doc.status === 'accepted') return { key: 'accepted', label: doc.invoiceId ? 'In Rechnung gestellt' : 'Angenommen', tone: 'good' };
    if (doc.status === 'declined') return { key: 'declined', label: 'Abgelehnt', tone: 'neutral' };
    if (doc.due && doc.due < t) return { key: 'expired', label: 'Abgelaufen', tone: 'warn' };
    return { key: 'open', label: 'Offen', tone: 'info' };
  }
  const typeLabel = doc => (isInvoice(doc) ? (isStorno(doc) ? 'Stornorechnung' : 'Rechnung') : 'Angebot');
  const docTitle = doc => `${typeLabel(doc)} ${doc.number || '(Entwurf)'}`;
  // Rechnung ist offen, wenn festgeschrieben, nicht storniert, kein Storno-Beleg und nicht voll bezahlt
  const isReceivable = doc => isInvoice(doc) && doc.status === 'final' && !isStorno(doc) && compute(doc).open > 0;

  /* ---------- Mahnwesen ---------- */
  const DUNNING_LEVELS = [
    { level: 0, key: 'reminder', label: 'Zahlungserinnerung', days: 7 },
    { level: 1, key: 'dun1', label: '1. Mahnung', days: 7 },
    { level: 2, key: 'dun2', label: '2. Mahnung', days: 5 },
  ];
  // Verzugszinsen: Basiszins + 9 PP (Unternehmer) bzw. + 5 PP (Verbraucher) p. a.; Pauschale 40 € nur B2B (§ 288 BGB)
  function calcDunning(doc, settings, level, dateIso) {
    const c = compute(doc);
    const dn = (settings && settings.dunning) || {};
    const days = Math.max(0, doc.due ? U.daysBetween(doc.due, dateIso) : 0);
    const business = !!(doc.client && doc.client.isBusiness);
    const base = dn.baseRate == null || dn.baseRate === '' ? null : Number(dn.baseRate);
    let interestRate = null, interest = 0;
    if (level >= 1 && base != null && Number.isFinite(base)) {
      interestRate = Math.round((base + (business ? 9 : 5)) * 100) / 100;
      interest = roundDiv(c.open * Math.round(interestRate * 100) * days, 10000 * 365);
    }
    const lumpSum = level >= 1 && business && dn.lumpSum !== false ? 4000 : 0;
    const fee = level === 0 ? (dn.feeReminder | 0) : level === 1 ? (dn.feeDun1 | 0) : (dn.feeDun2 | 0);
    return { open: c.open, days, interestRate, interest, lumpSum, fee, total: c.open + interest + lumpSum + fee, business };
  }

  /* ---------- Kleinunternehmer-Grenzen (§ 19 UStG, ab 2025) ---------- */
  const KLEIN_LIMITS = { prevYear: 2500000, currentYear: 10000000 };

  return {
    UNITS, unitOf, VAT_RATES, roundDiv, compute,
    validPattern, formatNumber, counterKey, peekNumber, takeNumber,
    docState, typeLabel, docTitle, isInvoice, isStorno, isReceivable,
    DUNNING_LEVELS, calcDunning, KLEIN_LIMITS,
  };
});
