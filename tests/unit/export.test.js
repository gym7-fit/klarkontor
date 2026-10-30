const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../js/store.js'), D = require('../../js/domain.js'), Demo = require('../../js/demo.js'), X = require('../../js/export.js');

const setup = () => { const st = S.createStore({ storage: S.memoryStorage() }); st.load(); Demo.fill(st, { today: '2026-10-30', klein: false }); return st; };

test('CSV: BOM, Semikolon, deutsche Dezimalkommas, Maskierung', () => {
  const csv = X.toCsv([['a', 'b;c', 'd"e', 'x\ny'], ['1,50', '', '', '']]);
  assert.ok(csv.startsWith('﻿'));
  assert.equal(csv, '﻿a;"b;c";"d""e";"x\ny"\r\n1,50;;;\r\n');
});
test('CSV: Formel-Injektion wird entschärft', () => {
  assert.equal(X.cell('=HYPERLINK("http://x")'), '"\'=HYPERLINK(""http://x"")"');
  assert.equal(X.cell('+49 30 123'), "'+49 30 123");
  assert.equal(X.cell('@foo'), "'@foo");
  assert.equal(X.cell(-5), '-5', 'Zahlen bleiben unverändert');
});
test('Rechnungsübersicht: alle festgeschriebenen Rechnungen des Jahres, Summen stimmen', () => {
  const st = setup();
  const rows = X.invoices(st.state, 2026);
  assert.equal(rows[0][0], 'Rechnungsnummer');
  const nums = rows.slice(1).map(r => r[0]);
  assert.deepEqual(nums, nums.slice().sort((a, b) => a.localeCompare(b, 'de', { numeric: true })));
  assert.ok(!nums.includes(null), 'keine Entwürfe');
  const r3 = rows.find(r => r[0] === 'RE-2026-003');
  assert.equal(r3[5], '2736,00'); // netto nach 5 % Rabatt
  assert.equal(r3[6], '519,84');  // 19 % USt
  assert.equal(r3[7], '3255,84');
  assert.equal(r3[8], 'Bezahlt');
});
test('Einnahmen: Zahlungseingänge nach Datum, Summenzeile, Storno-Hinweis', () => {
  const st = setup();
  const inv = st.state.documents.find(d => d.number === 'RE-2026-006');
  D.cancelInvoice(st, inv.id);
  const rows = X.income(st.state, 2026);
  const body = rows.slice(1, -1);
  const dates = body.map(r => r[0].split('.').reverse().join('-'));
  assert.deepEqual(dates, dates.slice().sort());
  const total = rows.at(-1);
  assert.equal(total[0], 'Summe');
  const sum = body.reduce((s, r) => s + Math.round(parseFloat(r[3].replace(',', '.')) * 100), 0);
  assert.equal(total[3], (sum / 100).toFixed(2).replace('.', ','));
  assert.ok(body.some(r => r[1] === 'RE-2026-006' && /storniert/.test(r[6])));
  for (const r of body) {
    const g = Math.round(parseFloat(r[3].replace(',', '.')) * 100), n = Math.round(parseFloat(r[4].replace(',', '.')) * 100), v = Math.round(parseFloat(r[5].replace(',', '.')) * 100);
    assert.equal(n + v, g, 'netto + USt = brutto');
  }
});
