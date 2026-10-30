/* Klarkontor – Hilfsfunktionen (Geld, Datum, Escaping, IBAN). Läuft im Browser und in Node. */
(function (root, factory) {
  const api = factory();
  root.KK = root.KK || {};
  root.KK.util = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /* ---------- HTML-Escaping ---------- */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);

  class SafeHtml {
    constructor(s) { this.s = s; }
    toString() { return this.s; }
  }
  const raw = s => new SafeHtml(String(s));

  // html`<b>${nutzereingabe}</b>` escaped Interpolationen automatisch; SafeHtml und Arrays davon bleiben erhalten.
  function html(strings, ...vals) {
    const part = v => {
      if (v == null || v === false) return '';
      if (v instanceof SafeHtml) return v.s;
      if (Array.isArray(v)) return v.map(part).join('');
      return esc(v);
    };
    let out = strings[0];
    for (let i = 0; i < vals.length; i++) out += part(vals[i]) + strings[i + 1];
    return new SafeHtml(out);
  }

  /* ---------- Geld (ganze Cent) ---------- */
  const nf = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eur = c => nf.format((c || 0) / 100) + ' €';
  const eurPlain = c => nf.format((c || 0) / 100);
  // CSV/Maschinenformat: 1234.5 -> "1234.50"
  const decimal = c => {
    const n = Math.round(c || 0), neg = n < 0, a = Math.abs(n);
    return (neg ? '-' : '') + Math.floor(a / 100) + '.' + String(a % 100).padStart(2, '0');
  };

  // "1.234,56" | "1234.56" | "12,5" | "12" -> Dezimalstring in normalisierter Form oder null
  function normalizeDecimal(input) {
    if (typeof input === 'number') return Number.isFinite(input) ? String(input) : null;
    let s = String(input == null ? '' : input).trim().replace(/[\s €]/g, '');
    if (!s) return null;
    let sign = '';
    if (s[0] === '-' || s[0] === '+') { sign = s[0] === '-' ? '-' : ''; s = s.slice(1); }
    if (!/^[\d.,]+$/.test(s)) return null;
    const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
      // das letzte Trennzeichen ist das Dezimalzeichen
      if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (lastComma >= 0) {
      if ((s.match(/,/g) || []).length > 1) s = s.replace(/,/g, '');
      else s = s.replace(',', '.');
    } else if (lastDot >= 0) {
      const dots = (s.match(/\./g) || []).length;
      if (dots > 1 || /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
    }
    if (!/^\d*\.?\d*$/.test(s) || s === '.' || s === '') return null;
    return sign + s;
  }

  // -> ganze Cent (Math.round auf Dezimalstellen, ohne Gleitkommafehler bei typischen Eingaben)
  function parseMoney(input) {
    const s = normalizeDecimal(input);
    if (s == null) return null;
    const neg = s[0] === '-';
    const [i, f = ''] = (neg ? s.slice(1) : s).split('.');
    const f3 = (f + '000').slice(0, 3); // kaufmännisch runden auf 2 Stellen, rein per Ziffern
    const cents = parseInt(i || '0', 10) * 100 + parseInt(f3.slice(0, 2), 10) + (f3[2] >= '5' ? 1 : 0);
    return neg ? -cents : cents;
  }
  // -> Zahl (z. B. Menge), max. 3 Nachkommastellen
  function parseNum(input) {
    const s = normalizeDecimal(input);
    if (s == null) return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
  }
  const fmtNum = n => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(n || 0);
  // Cent -> Eingabefeld-Text "1234,50" (ohne Tausenderpunkte)
  const moneyInput = c => (c == null ? '' : (Math.round(c) / 100).toFixed(2).replace('.', ','));
  const numInput = n => (n == null ? '' : String(n).replace('.', ','));
  // Prozent als Basispunkte (19,5 % -> 1950)
  const parsePercentBp = input => { const n = parseNum(input); return n == null ? null : Math.round(n * 100); };

  /* ---------- Datum (ISO-Strings YYYY-MM-DD, lokale Zeit) ---------- */
  const pad2 = n => String(n).padStart(2, '0');
  const isoOf = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  const today = () => isoOf(new Date());
  const isIso = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseIso(s));
  function parseIso(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d, 12); }
  const addDays = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return isoOf(d); };
  const daysBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 86400000); // b - a
  const yearOf = s => parseInt(String(s).slice(0, 4), 10);
  const fmtDate = s => (isIso(s) ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : '');
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const fmtDateLong = s => (isIso(s) ? `${+s.slice(8, 10)}. ${MONTHS[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}` : '');
  const monthKey = s => String(s).slice(0, 7);

  /* ---------- IDs, Texte ---------- */
  let seq = 0;
  function uid(prefix) {
    let r;
    try { r = crypto.randomUUID().replace(/-/g, '').slice(0, 12); }
    catch (e) { r = Date.now().toString(36) + (++seq).toString(36) + Math.random().toString(36).slice(2, 6); }
    return (prefix || 'x') + r;
  }
  const clean = s => String(s == null ? '' : s).replace(/\r\n?/g, '\n').trim();
  const lines = s => clean(s).split('\n').map(l => l.trim()).filter(Boolean);
  const safeFile = s => String(s || 'datei').replace(/[\\/:*?"<>|\s]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'datei';
  const plural = (n, one, many) => (n === 1 ? one : many);
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ---------- IBAN / BIC ---------- */
  const ibanNorm = s => String(s || '').replace(/\s+/g, '').toUpperCase();
  function ibanValid(s) {
    const i = ibanNorm(s);
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(i)) return false;
    if (i.startsWith('DE') && i.length !== 22) return false;
    const r = i.slice(4) + i.slice(0, 4);
    let rem = 0;
    for (const ch of r) {
      const v = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
      for (const d of v) rem = (rem * 10 + +d) % 97;
    }
    return rem === 1;
  }
  const ibanFmt = s => ibanNorm(s).replace(/(.{4})/g, '$1 ').trim();
  const bicValid = s => !s || /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(String(s).replace(/\s/g, '').toUpperCase());
  const emailValid = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());

  /* ---------- Länder (ISO 3166-1 alpha-2) ---------- */
  const COUNTRIES = [['DE', 'Deutschland'], ['AT', 'Österreich'], ['CH', 'Schweiz'], ['LU', 'Luxemburg'], ['NL', 'Niederlande'], ['BE', 'Belgien'],
    ['FR', 'Frankreich'], ['IT', 'Italien'], ['ES', 'Spanien'], ['PT', 'Portugal'], ['PL', 'Polen'], ['CZ', 'Tschechien'], ['DK', 'Dänemark'],
    ['SE', 'Schweden'], ['NO', 'Norwegen'], ['FI', 'Finnland'], ['IE', 'Irland'], ['GB', 'Vereinigtes Königreich'], ['US', 'USA']];
  const countryName = code => (COUNTRIES.find(c => c[0] === code) || [code, code || ''])[1];

  return {
    COUNTRIES, countryName,
    esc, html, raw, SafeHtml,
    eur, eurPlain, decimal, parseMoney, parseNum, fmtNum, moneyInput, numInput, parsePercentBp, normalizeDecimal,
    pad2, isoOf, today, isIso, parseIso, addDays, daysBetween, yearOf, fmtDate, fmtDateLong, monthKey, MONTHS,
    uid, clean, lines, safeFile, plural, debounce,
    ibanNorm, ibanValid, ibanFmt, bicValid, emailValid,
  };
});
