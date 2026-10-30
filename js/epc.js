/* Klarkontor – GiroCode (EPC-QR, EPC069-12 Version 002) */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const U = isNode ? require('./util.js') : root.KK.util;
  const Q = isNode ? require('../vendor/qrcode.js') : root.qrcode;
  const api = factory(U, Q);
  root.KK = root.KK || {};
  root.KK.epc = api;
  if (isNode) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function (U, qrcode) {
  'use strict';

  const clip = (s, n) => Array.from(String(s || '').replace(/[\r\n]+/g, ' ').trim()).slice(0, n).join('');

  // Liefert null, wenn kein gültiger Code erzeugt werden kann (ungültige IBAN, Betrag außerhalb 0,01 … 999.999.999,99 €)
  function payload({ name, iban, bic, amountCents, text }) {
    if (!U.ibanValid(iban)) return null;
    if (!Number.isInteger(amountCents) || amountCents < 1 || amountCents > 99999999999) return null;
    const n = clip(name, 70);
    if (!n) return null;
    return [
      'BCD', '002', '1', 'SCT',
      U.bicValid(bic) ? U.ibanNorm(bic) : '',
      n, U.ibanNorm(iban),
      'EUR' + U.decimal(amountCents),
      '', '', clip(text, 140),
    ].join('\n');
  }

  function matrix(text) {
    if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    const qr = qrcode(0, 'M');
    qr.addData(text, 'Byte');
    qr.make();
    const n = qr.getModuleCount();
    const m = [];
    for (let r = 0; r < n; r++) { const row = []; for (let c = 0; c < n; c++) row.push(qr.isDark(r, c)); m.push(row); }
    return m;
  }

  function giroCode(args) {
    const p = payload(args);
    return p ? { payload: p, matrix: matrix(p) } : null;
  }

  return { payload, matrix, giroCode };
});
