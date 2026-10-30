// Erzeugt E-Rechnungs-XML-Beispiele in tests/out/ (für validate_einvoice.py)
const fs = require('fs');
const S = require('../js/store.js'), D = require('../js/domain.js'), C = require('../js/calc.js'), Demo = require('../js/demo.js'), EI = require('../js/einvoice.js'), U = require('../js/util.js');
module.exports = function makeSamples(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const klein of [true, false]) {
    const st = S.createStore({ storage: S.memoryStorage() }); st.load();
    Demo.fill(st, { today: '2026-10-30', klein });
    const set = st.state.settings;
    const invs = st.state.documents.filter(d => d.type === 'invoice' && d.status !== 'draft');
    for (const d of invs) {
      st.state.contacts.forEach(c => { if (!c.email) c.email = 'x@y.example'; });
      d.client.email = d.client.email || 'kunde@beispiel.example';
      for (const profile of ['xrechnung', 'zugferd']) {
        const chk = EI.check(d, set, profile, null);
        if (chk.errors.length) throw new Error(d.number + ': ' + chk.errors.join('; '));
        const f = `${outDir}/${klein ? 'klein' : 'regel'}_${d.number}_${profile}.xml`;
        fs.writeFileSync(f, EI.build(d, set, { profile }));
        files.push(f);
      }
    }
    // Storno
    const target = invs.find(d => !d.cancelsId && d.status === 'final' && C.compute(d).open > 0);
    const s = D.cancelInvoice(st, target.id);
    s.client.email = s.client.email || 'kunde@beispiel.example';
    const f = `${outDir}/${klein ? 'klein' : 'regel'}_storno_${s.number}_xrechnung.xml`;
    fs.writeFileSync(f, EI.build(s, set, { profile: 'xrechnung', original: target }));
    files.push(f);
    // Leistungszeitraum + Rabatt als Betrag + zwei Steuersätze
    const e = D.createDocument(st, 'invoice');
    D.updateDocument(st, e.id, { date: '2026-10-30', due: '2026-11-13', serviceDate: '2026-10-01', serviceEnd: '2026-10-31', client: { ...e.client, name: 'Test & Söhne "KG"', street: 'Weg <1>', zip: '12345', city: 'Ort', email: 'a@b.example', vatId: 'DE123456789', buyerRef: '04011000-12345-34' },
      items: [{ ...e.items[0], desc: 'Beratung\nMit Sonderzeichen & <Tags>', qty: 7.5, unit: 'std', price: 9500, vat: 19 }, { ...e.items[0], id: U.uid('i'), desc: 'Fachbuch', qty: 2, unit: 'stk', price: 2990, vat: 7 }],
      discount: { mode: 'amount', value: 3333 }, reference: 'Bestellung 4711' });
    D.finalizeDocument(st, e.id);
    const f2 = `${outDir}/${klein ? 'klein' : 'regel'}_komplex_${e.number}_xrechnung.xml`;
    fs.writeFileSync(f2, EI.build(e, set, { profile: 'xrechnung' }));
    files.push(f2);
  }
  return files;
};
if (require.main === module) console.log(module.exports('tests/out/xml').join('\n'));
