const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../../js/util.js');
const C = require('../../js/calc.js');
const S = require('../../js/store.js');
const D = require('../../js/domain.js');

const newStore = (storage) => { const st = S.createStore({ storage: storage || S.memoryStorage() }); st.load(); return st; };
const setupCompany = st => Object.assign(st.state.settings.company, {
  name: 'Muster Webdesign', street: 'Hauptstr. 1', zip: '10115', city: 'Berlin', email: 'm@muster.de', phone: '030 1', taxNo: '12/345/67890', iban: 'DE89370400440532013000',
});

test('Geld parsen: deutsche und englische Schreibweisen', () => {
  assert.equal(U.parseMoney('1.234,56'), 123456);
  assert.equal(U.parseMoney('1234.56'), 123456);
  assert.equal(U.parseMoney('12,5'), 1250);
  assert.equal(U.parseMoney('12'), 1200);
  assert.equal(U.parseMoney('1.234'), 123400);       // Tausenderpunkt
  assert.equal(U.parseMoney('0,005'), 1);            // kaufmännisch gerundet
  assert.equal(U.parseMoney('-5,25'), -525);
  assert.equal(U.parseMoney('1.234.567,89'), 123456789);
  assert.equal(U.parseMoney('abc'), null);
  assert.equal(U.parseMoney(''), null);
  assert.equal(U.parseMoney('12 €'), 1200);
});
test('Formatierung', () => {
  assert.equal(U.eur(123456), '1.234,56 €');
  assert.equal(U.decimal(-5), '-0.05');
  assert.equal(U.decimal(100005), '1000.05');
  assert.equal(U.fmtDate('2026-03-07'), '07.03.2026');
  assert.equal(U.fmtDate('quatsch'), '');
  assert.equal(U.addDays('2026-12-25', 10), '2027-01-04');
  assert.equal(U.daysBetween('2026-01-01', '2026-03-01'), 59);
});
test('html-Template escaped Eingaben und lässt SafeHtml durch', () => {
  const evil = '<img src=x onerror=alert(1)>';
  assert.equal(String(U.html`<b>${evil}</b>`), '<b>&lt;img src=x onerror=alert(1)&gt;</b>');
  const inner = U.html`<i>${'a&b'}</i>`;
  assert.equal(String(U.html`<p>${inner}</p>`), '<p><i>a&amp;b</i></p>');
  assert.equal(String(U.html`${[U.html`<a>${1}</a>`, '<x>']}`), '<a>1</a>&lt;x&gt;');
});
test('IBAN-Prüfung', () => {
  assert.ok(U.ibanValid('DE89 3704 0044 0532 0130 00'));
  assert.ok(!U.ibanValid('DE89 3704 0044 0532 0130 01'));
  assert.ok(!U.ibanValid('DE89'));
  assert.ok(U.ibanValid('GB82WEST12345698765432'));
});

test('Berechnung: Kleinunternehmer ohne USt', () => {
  const c = C.compute({ klein: true, items: [{ qty: 2, price: 15000, vat: 19 }, { qty: 1.5, price: 8000, vat: 19 }] });
  assert.equal(c.net, 42000);
  assert.equal(c.vat, 0);
  assert.equal(c.gross, 42000);
  assert.equal(c.groups.length, 1);
  assert.equal(c.groups[0].cat, 'E');
});
test('Berechnung: USt je Satz, Rundung je Gruppe', () => {
  const c = C.compute({ klein: false, items: [
    { qty: 1, price: 3333, vat: 19 }, { qty: 1, price: 3333, vat: 19 }, { qty: 3, price: 1999, vat: 7 },
  ] });
  assert.equal(c.lineTotal, 3333 * 2 + 5997);
  const g19 = c.groups.find(g => g.rate === 19), g7 = c.groups.find(g => g.rate === 7);
  assert.equal(g19.vat, Math.round(6666 * 0.19));
  assert.equal(g7.vat, Math.round(5997 * 0.07));
  assert.equal(c.gross, c.net + c.vat);
});
test('Berechnung: Menge × Preis mit Dezimalmengen rundet kaufmännisch', () => {
  assert.equal(C.compute({ klein: true, items: [{ qty: 0.333, price: 1000 }] }).net, 333);
  assert.equal(C.compute({ klein: true, items: [{ qty: 1.005, price: 100 }] }).net, 101);
  assert.equal(C.compute({ klein: true, items: [{ qty: -2, price: 1050 }] }).net, -2100);
});
test('Berechnung: Rabatt in Prozent und als Betrag verteilt sich auf die Steuersätze', () => {
  const items = [{ qty: 1, price: 10000, vat: 19 }, { qty: 1, price: 10000, vat: 7 }];
  const p = C.compute({ klein: false, items, discount: { mode: 'percent', value: 1000 } }); // 10 %
  assert.equal(p.allowanceTotal, 2000);
  assert.equal(p.net, 18000);
  assert.equal(p.vat, 1710 + 630);
  const a = C.compute({ klein: false, items, discount: { mode: 'amount', value: 3333 } });
  assert.equal(a.allowanceTotal, 3333);
  assert.equal(a.groups.reduce((s, g) => s + g.taxable, 0), 20000 - 3333);
  const big = C.compute({ klein: true, items: [{ qty: 1, price: 1000 }], discount: { mode: 'amount', value: 999999 } });
  assert.equal(big.net, 0); // nie mehr Rabatt als Summe
});
test('Berechnung: Summenkonsistenz bei vielen Positionen (Zufall)', () => {
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let n = 0; n < 200; n++) {
    const items = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => ({ qty: Math.round(rnd() * 20000) / 1000, price: Math.round(rnd() * 99999), vat: rnd() > .5 ? 19 : 7 }));
    const d = { klein: false, items, discount: rnd() > .5 ? { mode: 'percent', value: Math.round(rnd() * 3000) } : null };
    const c = C.compute(d);
    assert.equal(c.lineTotal, c.lines.reduce((s, l) => s + l.net, 0));
    assert.equal(c.net, c.groups.reduce((s, g) => s + g.taxable, 0));
    assert.equal(c.gross, c.net + c.groups.reduce((s, g) => s + g.vat, 0));
  }
});

test('Nummernkreise: Jahresmuster, Zähler je Jahr, Kollisionen werden übersprungen', () => {
  const seq = { pattern: 'RE-{YYYY}-{NNN}', counters: {} };
  assert.equal(C.takeNumber(seq, 2026), 'RE-2026-001');
  assert.equal(C.takeNumber(seq, 2026), 'RE-2026-002');
  assert.equal(C.takeNumber(seq, 2027), 'RE-2027-001');
  assert.equal(C.takeNumber(seq, 2026, new Set(['RE-2026-003'])), 'RE-2026-004');
  const plain = { pattern: '{YY}{NNNN}', counters: {} };
  assert.equal(C.takeNumber(plain, 2026), '260001');
  const fixed = { pattern: 'R{NN}', counters: {} };
  assert.equal(C.takeNumber(fixed, 2026), 'R01');
  assert.equal(C.takeNumber(fixed, 2030), 'R02');
  assert.ok(!C.validPattern('RE-2026'));
});

test('Store: Standardwerte, Persistenz und Neuladen', () => {
  const storage = S.memoryStorage();
  const st = newStore(storage);
  assert.equal(st.state.version, 2);
  D.createContact(st, { name: 'Huber GmbH' });
  const again = newStore(storage);
  assert.equal(again.state.contacts[0].name, 'Huber GmbH');
});
test('Store: Migration des alten Akquise-Trackers', () => {
  const storage = S.memoryStorage();
  storage.setItem(S.LEGACY_KEY, JSON.stringify([
    { id: 'c1', name: 'Schreinerei Huber', contact: '0170 123', status: 'Termin', notes: 'x', followup: '2026-11-01', createdAt: '2026-08-01' },
    { id: 'c2', name: 'Anna', contact: 'a@b.de', status: 'Kaputt' },
  ]));
  const st = newStore(storage);
  assert.equal(st.state.contacts.length, 2);
  assert.equal(st.state.contacts[0].phone, '0170 123');
  assert.equal(st.state.contacts[1].email, 'a@b.de');
  assert.equal(st.state.contacts[1].status, 'Neu');
  assert.ok(st.state.meta.legacyMigrated);
  assert.ok(storage.getItem(S.KEY));
  assert.ok(storage.getItem(S.LEGACY_KEY), 'Altdaten bleiben als Sicherung erhalten');
});
test('Store: kaputte Daten fallen auf Standard zurück, Import validiert', () => {
  const storage = S.memoryStorage();
  storage.setItem(S.KEY, '{kaputt');
  const st = newStore(storage);
  assert.equal(st.state.contacts.length, 0);
  assert.equal(st.importData('nix').ok, false);
  assert.equal(st.importData(JSON.stringify({ app: 'foo' })).ok, false);
  assert.equal(st.importData(JSON.stringify({ app: 'klarkontor', state: { version: 99 } })).ok, false);
});
test('Store: Export/Import-Roundtrip und Merge', () => {
  const a = newStore(); setupCompany(a);
  D.createContact(a, { name: 'K1' });
  const doc = D.createDocument(a, 'quote'); D.updateDocument(a, doc.id, { client: { ...doc.client, name: 'K1' }, items: [{ ...doc.items[0], desc: 'Test', price: 1000 }] });
  const json = a.exportData();
  const b = newStore();
  assert.ok(b.importData(json).ok);
  assert.equal(b.state.contacts.length, 1);
  assert.equal(b.state.documents.length, 1);
  D.createContact(b, { name: 'K2' });
  assert.ok(b.importData(json, 'merge').ok);
  assert.equal(b.state.contacts.length, 2, 'Merge dupliziert nichts');
});
test('Store: Speicherfehler (Kontingent) wird gemeldet statt zu crashen', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem() {} };
  const st = S.createStore({ storage }); st.load();
  let err = null; st.on((t, i) => { if (t === 'error') err = i; });
  D.createContact(st, { name: 'x' });
  assert.ok(err);
});

test('Ablauf: Entwurf → Festschreiben vergibt lückenlose Nummern und sperrt', () => {
  const st = newStore(); setupCompany(st);
  const mk = () => {
    const d = D.createDocument(st, 'invoice');
    D.updateDocument(st, d.id, { client: { ...d.client, name: 'Kunde', street: 'Weg 1', zip: '12345', city: 'Ort' }, items: [{ ...d.items[0], desc: 'Arbeit', price: 10000 }] });
    return d;
  };
  const a = mk(), b = mk();
  D.finalizeDocument(st, a.id); D.finalizeDocument(st, b.id);
  assert.match(a.number, /^RE-\d{4}-001$/);
  assert.match(b.number, /^RE-\d{4}-002$/);
  assert.throws(() => D.updateDocument(st, a.id, { title: 'x' }), /Festgeschrieben/);
  assert.throws(() => D.deleteDocument(st, a.id), /Nur Entwürfe/);
  assert.throws(() => D.finalizeDocument(st, a.id), /bereits/);
  D.updateDocument(st, a.id, { notes: 'interne Notiz' }); // erlaubt
});
test('Ablauf: Festschreiben prüft Pflichtangaben', () => {
  const st = newStore();
  const d = D.createDocument(st, 'invoice');
  const v = D.validateForFinalize(st, d);
  assert.ok(v.errors.some(e => /Firmenname/.test(e)));
  assert.ok(v.errors.some(e => /Steuernummer/.test(e)));
  assert.ok(v.errors.some(e => /Empfänger/.test(e)));
  assert.ok(v.errors.some(e => /Beschreibung/.test(e)));
  assert.throws(() => D.finalizeDocument(st, d.id));
  assert.equal(d.number, null, 'keine Nummer verbraucht');
  assert.equal(st.state.settings.numbering.invoice.counters[String(new Date().getFullYear())], undefined);
});
test('Ablauf: Angebot → Rechnung, Kontakt wird Kunde', () => {
  const st = newStore(); setupCompany(st);
  const c = D.createContact(st, { name: 'Huber', street: 'S 1', zip: '1', city: 'O', status: 'Angebot' });
  const q = D.createDocument(st, 'quote', { contactId: c.id });
  D.updateDocument(st, q.id, { items: [{ ...q.items[0], desc: 'Website', price: 250000 }] });
  assert.throws(() => D.quoteToInvoice(st, q.id), /festgeschriebene/);
  D.finalizeDocument(st, q.id);
  const inv = D.quoteToInvoice(st, q.id);
  assert.equal(inv.status, 'draft');
  assert.equal(inv.quoteId, q.id);
  assert.equal(q.status, 'accepted');
  assert.equal(c.status, 'Kunde');
  assert.equal(inv.items[0].desc, 'Website');
  assert.notEqual(inv.items[0].id, q.items[0].id);
  assert.throws(() => D.quoteToInvoice(st, q.id), /bereits/);
  D.deleteDocument(st, inv.id);
  assert.equal(q.invoiceId, null, 'Verknüpfung gelöst');
  assert.equal(C.docState(q).label, 'Angenommen');
  assert.ok(D.quoteToInvoice(st, q.id), 'erneut umwandelbar');
});
test('Ablauf: Zahlungen, Teilzahlung, überfällig, Storno', () => {
  const st = newStore(); setupCompany(st);
  const d = D.createDocument(st, 'invoice');
  D.updateDocument(st, d.id, { date: '2026-01-10', due: '2026-01-24', client: { ...d.client, name: 'K', street: 'a', zip: '1', city: 'b' }, items: [{ ...d.items[0], desc: 'x', price: 10000 }] });
  D.finalizeDocument(st, d.id);
  assert.equal(C.docState(d, '2026-01-20').key, 'open');
  assert.equal(C.docState(d, '2026-02-03').key, 'overdue');
  assert.equal(C.docState(d, '2026-02-03').overdueDays, 10);
  D.addPayment(st, d.id, { date: '2026-02-04', amount: 4000 });
  assert.equal(C.compute(d).open, 6000);
  assert.equal(C.docState(d, '2026-01-20').key, 'partial');
  assert.throws(() => D.addPayment(st, d.id, { date: '2026-02-04', amount: 0 }));
  D.markPaid(st, d.id, '2026-02-05');
  assert.equal(C.docState(d, '2026-03-01').key, 'paid');
  assert.equal(D.receivables(st.state, '2026-03-01').openSum, 0);

  const e = D.createDocument(st, 'invoice');
  D.updateDocument(st, e.id, { client: { ...e.client, name: 'K', street: 'a', zip: '1', city: 'b' }, items: [{ ...e.items[0], desc: 'y', price: 5000 }] });
  D.finalizeDocument(st, e.id);
  const s = D.cancelInvoice(st, e.id);
  assert.equal(e.status, 'cancelled');
  assert.equal(s.cancelsId, e.id);
  assert.equal(C.compute(s).gross, -5000);
  assert.equal(C.docState(s).key, 'storno');
  assert.throws(() => D.cancelInvoice(st, e.id), /storniert|kann nicht/);
  assert.equal(D.receivables(st.state, '2026-03-01').openSum, 0, 'Storno-Paare zählen nicht als Forderung');
});
test('Mahnberechnung: Zinsen nur mit Basiszins, Pauschale nur B2B', () => {
  const doc = { due: '2026-01-01', client: { isBusiness: true }, items: [{ qty: 1, price: 100000, vat: 0 }], klein: true, payments: [] };
  const none = C.calcDunning(doc, { dunning: { baseRate: null, lumpSum: true, feeDun1: 500 } }, 1, '2026-01-31');
  assert.equal(none.interest, 0); assert.equal(none.lumpSum, 4000); assert.equal(none.fee, 500); assert.equal(none.days, 30);
  const r = C.calcDunning(doc, { dunning: { baseRate: 2, lumpSum: true } }, 1, '2026-01-31');
  assert.equal(r.interestRate, 11);
  assert.equal(r.interest, Math.round(100000 * 0.11 * 30 / 365));
  const b2c = C.calcDunning({ ...doc, client: { isBusiness: false } }, { dunning: { baseRate: 2 } }, 1, '2026-01-31');
  assert.equal(b2c.lumpSum, 0); assert.equal(b2c.interestRate, 7);
  assert.equal(C.calcDunning(doc, { dunning: { baseRate: 2 } }, 0, '2026-01-31').interest, 0, 'Erinnerung ohne Zinsen');
});
test('Kontakt: Statuswechsel schreibt Verlauf', () => {
  const st = newStore();
  const c = D.createContact(st, { name: 'A' });
  D.updateContact(st, c.id, { status: 'Termin' });
  assert.match(c.log[0].text, /Neu → Termin/);
});
test('Auswertung: Umsatz nach Zahlungseingang, Storno zählt nicht', () => {
  const st = newStore(); setupCompany(st);
  const mk = (price, date) => { const d = D.createDocument(st, 'invoice'); D.updateDocument(st, d.id, { date, due: date, client: { ...d.client, name: 'K', street: 'a', zip: '1', city: 'b' }, items: [{ ...d.items[0], desc: 'x', price }] }); D.finalizeDocument(st, d.id); return d; };
  const a = mk(100000, '2026-02-01'); D.markPaid(st, a.id, '2026-02-10');
  const b = mk(50000, '2026-03-01');
  const c = mk(70000, '2026-04-01'); D.cancelInvoice(st, c.id);
  const r = D.revenueByYear(st.state, 2026);
  assert.equal(r.paidNet, 100000);
  assert.equal(r.billedNet, 150000);
  assert.equal(r.openGross, 50000);
  assert.equal(D.monthlyRevenue(st.state, 2026)[1], 100000);
});
