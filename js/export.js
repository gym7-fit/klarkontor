/* Klarkontor – CSV-Exporte für den Steuerberater (Semikolon, deutsche Dezimalkommas, UTF-8 mit BOM). */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const U = isNode ? require('./util.js') : root.KK.util;
  const C = isNode ? require('./calc.js') : root.KK.calc;
  const api = factory(U, C);
  root.KK = root.KK || {};
  root.KK.export = api;
  if (isNode) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function (U, C) {
  'use strict';

  // Schutz vor Formel-Injektion in Tabellenkalkulationen (=, +, -, @ am Zellanfang bei Text)
  function cell(v) {
    let s = v == null ? '' : String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  const toCsv = rows => '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n') + '\r\n';
  const m = c => U.moneyInput(c);

  // Alle ausgestellten Rechnungen des Jahres (nach Rechnungsdatum), inkl. Stornos
  function invoices(state, year) {
    const head = ['Rechnungsnummer', 'Rechnungsdatum', 'Leistungsdatum', 'Kunde', 'Art', 'Netto (EUR)', 'Umsatzsteuer (EUR)', 'Brutto (EUR)', 'Status', 'Bezahlt (EUR)', 'Zuletzt bezahlt am', 'Offen (EUR)'];
    const rows = [head];
    const list = state.documents.filter(d => d.type === 'invoice' && d.status !== 'draft' && U.yearOf(d.date) === year)
      .sort((a, b) => (a.number || '').localeCompare(b.number || '', 'de', { numeric: true }));
    for (const d of list) {
      const c = C.compute(d);
      const st = C.docState(d);
      const last = d.payments.map(p => p.date).sort().pop() || '';
      rows.push([d.number, U.fmtDate(d.date), U.fmtDate(d.serviceDate || d.date), d.client.name, C.typeLabel(d), m(c.net), m(c.vat), m(c.gross),
        st.key === 'overdue' ? 'Überfällig' : st.label, m(c.paid), U.fmtDate(last), C.isStorno(d) || d.status === 'cancelled' ? m(0) : m(c.open)]);
    }
    return rows;
  }

  // Zahlungseingänge des Jahres (Einnahmen nach Zufluss, z. B. für die EÜR)
  function income(state, year) {
    const rows = [['Zahlungsdatum', 'Rechnungsnummer', 'Kunde', 'Betrag brutto (EUR)', 'davon netto (EUR)', 'davon Umsatzsteuer (EUR)', 'Hinweis']];
    const pays = [];
    for (const d of state.documents.filter(x => x.type === 'invoice' && x.status !== 'draft' && !x.cancelsId)) {
      const c = C.compute(d);
      for (const p of d.payments) if (U.yearOf(p.date) === year) pays.push({ d, c, p });
    }
    pays.sort((a, b) => a.p.date.localeCompare(b.p.date));
    for (const { d, c, p } of pays) {
      const net = c.gross ? Math.round(p.amount * c.net / c.gross) : p.amount;
      rows.push([U.fmtDate(p.date), d.number, d.client.name, m(p.amount), m(net), m(p.amount - net), (d.status === 'cancelled' ? 'Rechnung storniert – Erstattung prüfen. ' : '') + (p.note || '')]);
    }
    const total = pays.reduce((s, { p }) => s + p.amount, 0);
    rows.push(['Summe', '', '', m(total), '', '', '']);
    return rows;
  }

  return { toCsv, invoices, income, cell };
});
