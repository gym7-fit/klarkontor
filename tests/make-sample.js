// Erzeugt Beispiel-PDFs aus den Demodaten (für manuelle Sichtprüfung): node tests/make-sample.js [regular]
const fs = require('fs');
const S = require('../js/store.js'), D = require('../js/domain.js'), C = require('../js/calc.js'), Demo = require('../js/demo.js');
const L = require('../js/layout.js'), DP = require('../js/docpdf.js');
const klein = process.argv[2] !== 'regular';
const st = S.createStore({ storage: S.memoryStorage() }); st.load();
Demo.fill(st, { today: '2026-10-30', klein });
const set = st.state.settings;
const out = 'tests/out/';
const docs = st.state.documents;
const pick = (pred) => docs.find(pred);
const jobs = {
  invoice_paid: pick(d => d.number && d.type === 'invoice' && d.items.length === 3),
  invoice_overdue: pick(d => d.type === 'invoice' && C.docState(d, '2026-10-30').key === 'overdue'),
  quote: pick(d => d.type === 'quote' && d.status === 'final'),
  draft: pick(d => d.status === 'draft'),
};
for (const [name, doc] of Object.entries(jobs)) {
  const lay = L.layoutDocument(doc, set);
  fs.writeFileSync(`${out}${name}.pdf`, DP.toPdf(lay, { author: set.company.name }));
  console.log(name, doc.number, 'Seiten:', lay.pages.length, 'gesamt', C.compute(doc).gross);
}
const od = jobs.invoice_overdue;
for (const lvl of [0, 1, 2]) {
  const lay = L.layoutDunning(od, set, lvl, '2026-10-30');
  fs.writeFileSync(`${out}dunning${lvl}.pdf`, DP.toPdf(lay, { author: set.company.name }));
  console.log('dunning', lvl, JSON.stringify(lay.dunning));
}
