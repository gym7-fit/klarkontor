const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');
const S = require('../../js/store.js'), D = require('../../js/domain.js'), C = require('../../js/calc.js'), U = require('../../js/util.js');
const Demo = require('../../js/demo.js'), L = require('../../js/layout.js'), DP = require('../../js/docpdf.js');
const EPC = require('../../js/epc.js'), EI = require('../../js/einvoice.js'), PDF = require('../../js/pdf.js');

const have = cmd => spawnSync('which', [cmd]).status === 0;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-'));
const setup = (klein = true) => { const st = S.createStore({ storage: S.memoryStorage() }); st.load(); Demo.fill(st, { today: '2026-10-30', klein }); return st; };
const text = (file, args = []) => spawnSync('pdftotext', [...args, '-layout', file, '-'], { encoding: 'utf8' }).stdout;

test('EPC/GiroCode: Payload nach EPC069-12 und Grenzfälle', () => {
  const p = EPC.payload({ name: 'Muster Webdesign', iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX', amountCents: 273600, text: 'RE-2026-003' });
  assert.equal(p, 'BCD\n002\n1\nSCT\nCOBADEFFXXX\nMuster Webdesign\nDE89370400440532013000\nEUR2736.00\n\n\nRE-2026-003');
  assert.equal(EPC.payload({ name: 'X', iban: 'DE89370400440532013001', amountCents: 100 }), null, 'ungültige IBAN');
  assert.equal(EPC.payload({ name: 'X', iban: 'DE89370400440532013000', amountCents: 0 }), null, 'Betrag 0');
  assert.equal(EPC.payload({ name: '', iban: 'DE89370400440532013000', amountCents: 100 }), null, 'Name fehlt');
  const long = EPC.payload({ name: 'Ä'.repeat(100), iban: 'DE89370400440532013000', amountCents: 1, text: 'x'.repeat(300) }).split('\n');
  assert.equal(Array.from(long[5]).length, 70);
  assert.equal(long[10].length, 140);
});

test('Textumbruch: Wörter, harte Umbrüche und überlange Wörter', () => {
  const lines = L.wrap('Dies ist ein langer Satz der umbrochen werden muss', 'r', 10, 40);
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(require('../../js/fontmetrics.js').width(l, 'r', 10) <= 40.01);
  const w = L.wrap('A'.repeat(200), 'r', 10, 40);
  assert.ok(w.length > 3 && w.join('').length === 200);
  assert.deepEqual(L.wrap('a\n\nb', 'r', 10, 100), ['a', '', 'b']);
});

test('PDF: gültiger Aufbau, Text und Beträge stimmen (Rechnung, Angebot, Entwurf, Mahnungen)', { skip: !have('pdfinfo') }, () => {
  const st = setup(), set = st.state.settings;
  const docs = st.state.documents;
  const inv = docs.find(d => d.number === 'RE-2026-003');
  const lay = L.layoutDocument(inv, set);
  const file = path.join(TMP, 'inv.pdf');
  fs.writeFileSync(file, DP.toPdf(lay, { author: set.company.name }));
  const info = spawnSync('pdfinfo', [file], { encoding: 'utf8' });
  assert.equal(info.status, 0, info.stderr);
  assert.match(info.stdout, /Pages:\s+1/);
  assert.match(info.stdout, /Title:\s+Rechnung RE-2026-003/);
  const t = text(file);
  for (const s of ['RE-2026-003', 'Schreinerei Huber GmbH', '2.736,00 €', 'Rabatt 5 %', '§ 19 UStG', 'DE89 3704 0044 0532 0130 00', 'Seite 1 von 1', 'Sehr geehrter Herr Huber']) assert.ok(t.includes(s), 'fehlt: ' + s);
  const q = docs.find(d => d.type === 'quote' && d.status === 'final');
  const qf = path.join(TMP, 'q.pdf'); fs.writeFileSync(qf, DP.toPdf(L.layoutDocument(q, set)));
  const qt = text(qf);
  assert.ok(qt.includes('Angebot AN-') && qt.includes('Gültig bis') && !qt.includes('GiroCode') && !qt.includes('Zahlbar bis'));
  const dr = docs.find(d => d.status === 'draft');
  const df = path.join(TMP, 'd.pdf'); fs.writeFileSync(df, DP.toPdf(L.layoutDocument(dr, set)));
  assert.ok(text(df).includes('(Entwurf)'));
  const od = docs.find(d => C.docState(d, '2026-10-30').key === 'overdue');
  for (const lvl of [0, 1, 2]) {
    const f = path.join(TMP, `m${lvl}.pdf`); fs.writeFileSync(f, DP.toPdf(L.layoutDunning(od, set, lvl, '2026-10-30')));
    const mt = text(f);
    assert.ok(mt.includes(['Zahlungserinnerung', '1. Mahnung', '2. Mahnung'][lvl]));
    assert.ok(mt.includes('297,50 €'));
    if (lvl >= 1) assert.ok(mt.includes('Verzugspauschale') && mt.includes('Verzugszinsen'));
    else assert.ok(!mt.includes('Verzugspauschale'));
  }
});

test('PDF: Umlaute, €, Gedankenstrich und Sonderzeichen werden korrekt kodiert', { skip: !have('pdftotext') }, () => {
  const st = setup(), set = st.state.settings;
  const d = D.createDocument(st, 'invoice');
  Object.assign(d, { number: 'RE-1', status: 'final', client: { ...d.client, name: 'Müller & Söhne – Café „Grün“ (KG)', street: 'Straße 1', zip: '1', city: 'Köln', country: 'AT' }, items: [{ id: 'a', desc: 'Überprüfung – äöüß ÄÖÜ € 100 % <tag> "quote" \\ ( )', qty: 1, unit: 'stk', price: 100, vat: 0 }] });
  const f = path.join(TMP, 'u.pdf'); fs.writeFileSync(f, DP.toPdf(L.layoutDocument(d, set)));
  const t = text(f);
  for (const s of ['Müller & Söhne – Café „Grün“ (KG)', 'Überprüfung – äöüß ÄÖÜ € 100 % <tag> "quote" \\ ( )', 'Köln', 'ÖSTERREICH']) assert.ok(t.includes(s), 'fehlt: ' + s);
});

test('PDF: viele Positionen laufen auf Folgeseiten, Kopf/Fuß und Seitenzahlen stimmen', { skip: !have('pdftotext') }, () => {
  const st = setup(), set = st.state.settings;
  const d = D.createDocument(st, 'invoice');
  Object.assign(d, { number: 'RE-9', status: 'final', client: { ...d.client, name: 'K', street: 'S', zip: '1', city: 'O' } });
  d.items = Array.from({ length: 70 }, (_, i) => ({ id: 'i' + i, desc: `Position ${i + 1}\nDetailzeile mit etwas längerem Text, der garantiert umbrochen werden muss, damit mehrere Zeilen entstehen`, qty: 1, unit: 'stk', price: 1000 + i, vat: 0 }));
  const lay = L.layoutDocument(d, set);
  assert.ok(lay.pages.length >= 4);
  const f = path.join(TMP, 'long.pdf'); fs.writeFileSync(f, DP.toPdf(lay));
  const total = U.eur(C.compute(d).gross).replace(/\u00a0/g, ' ');
  for (let p = 1; p <= lay.pages.length; p++) {
    const t = text(f, ['-f', String(p), '-l', String(p)]);
    assert.ok(t.includes(`Seite ${p} von ${lay.pages.length}`), 'Seitenzahl ' + p);
    if (p > 1) assert.ok(t.includes('Rechnung RE-9'), 'Kopfzeile auf Folgeseite');
    if (p > 1 && p < lay.pages.length) assert.ok(t.includes('Beschreibung'), 'Tabellenkopf wiederholt sich');
  }
  const all = text(f);
  assert.ok(all.includes(total) && all.includes('Position 70') && all.includes('Position 1\n'.trim()));
  // keine Inhalte unterhalb der Fußzeilenlinie außer Fuß
  for (const pg of lay.pages) for (const op of pg.ops) if (op.t === 'text' && op.y > 266 && op.y < 272) assert.fail('Text im Fußbereich: ' + op.s);
});

test('GiroCode im PDF ist mit einem QR-Scanner lesbar und enthält Betrag und Verwendungszweck', { skip: !have('pdftoppm') }, () => {
  const jsQR = require('jsqr'), { PNG } = require('pngjs');
  const st = setup(), set = st.state.settings;
  const inv = st.state.documents.find(d => d.number === 'RE-2026-003');
  const f = path.join(TMP, 'qr.pdf'); fs.writeFileSync(f, DP.toPdf(L.layoutDocument(inv, set)));
  const r = spawnSync('pdftoppm', ['-r', '300', '-png', '-f', '1', '-l', '1', f, path.join(TMP, 'qr')]);
  assert.equal(r.status, 0);
  const png = PNG.sync.read(fs.readFileSync(path.join(TMP, 'qr-1.png')));
  const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.ok(code, 'QR nicht erkannt');
  const expected = EPC.payload({ name: set.company.name, iban: set.company.iban, bic: set.company.bic, amountCents: C.compute(inv).gross, text: 'Rechnung RE-2026-003' });
  assert.equal(code.data.replace(/\r/g, ''), expected);
  assert.match(code.data, /EUR2736\.00/);
});

test('Hybrid-PDF: XML ist eingebettet, extrahierbar und identisch', { skip: !have('pdfinfo') }, () => {
  const st = setup(), set = st.state.settings;
  const inv = st.state.documents.find(d => d.number === 'RE-2026-003');
  inv.client.email = 'k@beispiel.example';
  const xml = EI.build(inv, set, { profile: 'zugferd' });
  const f = path.join(TMP, 'hybrid.pdf');
  fs.writeFileSync(f, DP.toPdf(L.layoutDocument(inv, set), { author: 'x', xml, xmlName: 'factur-x.xml' }));
  assert.equal(spawnSync('pdfinfo', [f]).status, 0);
  const py = `
import sys
try:
    import pypdf
except ImportError:
    print('SKIP'); sys.exit(0)
r = pypdf.PdfReader(sys.argv[1], strict=True)
att = r.attachments
assert 'factur-x.xml' in att, list(att)
sys.stdout.buffer.write(att['factur-x.xml'][0])
`;
  const out = spawnSync('python3', ['-I', '-c', py, f]);
  if (out.stdout.toString().trim() === 'SKIP') return;
  assert.equal(out.status, 0, out.stderr.toString());
  assert.equal(out.stdout.toString('utf8'), xml);
  const raw = fs.readFileSync(f, 'latin1');
  assert.ok(raw.includes('/AFRelationship /Alternative') && raw.includes('urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#') && raw.includes('<fx:ConformanceLevel>EN 16931'));
  // Die Python-Bibliothek 'factur-x' erkennt das Hybrid ebenfalls
  const fx = spawnSync('python3', ['-I', '-c', 'import sys\ntry:\n import facturx\nexcept ImportError:\n print("SKIP"); sys.exit(0)\nname, data = facturx.get_facturx_xml_from_pdf(open(sys.argv[1], "rb"), check_xsd=True)\nprint(name)', f]);
  if (fx.stdout.toString().trim() !== 'SKIP') { assert.equal(fx.status, 0, fx.stderr.toString()); assert.match(fx.stdout.toString(), /factur-x\.xml/); }
});

test('E-Rechnung: Pflichtfeld-Prüfung meldet Lücken verständlich', () => {
  const st = setup(), set = st.state.settings;
  const inv = st.state.documents.find(d => d.number === 'RE-2026-003');
  inv.client.email = '';
  let r = EI.check(inv, set, 'xrechnung');
  assert.ok(r.errors.some(e => /Empfängers/.test(e) && /E-Mail/.test(e)), 'Empfänger-E-Mail für XRechnung');
  assert.ok(r.warnings.some(w => /Käuferreferenz/.test(w)));
  assert.equal(EI.check(inv, set, 'zugferd').errors.length, 0, 'ZUGFeRD braucht keine Empfänger-E-Mail');
  set.company.iban = ''; set.company.taxNo = ''; set.company.phone = '';
  r = EI.check(inv, set, 'xrechnung');
  assert.ok(r.errors.some(e => /IBAN/.test(e)) && r.errors.some(e => /Steuernummer/.test(e)) && r.errors.some(e => /Telefon/.test(e)));
  const q = st.state.documents.find(d => d.type === 'quote');
  assert.ok(EI.check(q, set).errors.some(e => /Nur Rechnungen/.test(e)));
  const dr = st.state.documents.find(d => d.status === 'draft');
  assert.ok(EI.check(dr, set).errors.some(e => /festgeschrieben/.test(e)));
});

test('E-Rechnung: XML ist wohlgeformt und enthält korrekte Summen/Escaping', () => {
  const st = setup(false), set = st.state.settings;
  const d = D.createDocument(st, 'invoice');
  D.updateDocument(st, d.id, { client: { ...d.client, name: 'A & B <KG>', street: 'Str. 1', zip: '1', city: 'O', email: 'a@b.example' }, items: [{ ...d.items[0], desc: 'Test & <x>', qty: 3, price: 3333, vat: 19 }] });
  D.finalizeDocument(st, d.id);
  const xml = EI.build(d, set, { profile: 'xrechnung' });
  assert.ok(xml.includes('A &amp; B &lt;KG&gt;') && xml.includes('Test &amp; &lt;x&gt;'));
  assert.ok(xml.includes('<ram:LineTotalAmount>99.99</ram:LineTotalAmount>'));
  assert.ok(xml.includes('<ram:TaxTotalAmount currencyID="EUR">19.00</ram:TaxTotalAmount>'));
  assert.ok(xml.includes('<ram:GrandTotalAmount>118.99</ram:GrandTotalAmount>'));
  assert.ok(xml.includes('urn:xeinkauf.de:kosit:xrechnung_3.0'));
  assert.ok(!EI.build(d, set, { profile: 'zugferd' }).includes('xrechnung'));
});

test('E-Rechnung: XSD- und EN-16931-Schematron-Validierung aller Varianten', { skip: !have('python3') }, () => {
  const make = require('../make-einvoice-samples.js');
  const files = make(path.join(TMP, 'xml'));
  assert.ok(files.length >= 20);
  const r = spawnSync('python3', [path.join(__dirname, '..', 'validate_einvoice.py'), ...files], { encoding: 'utf8', maxBuffer: 1 << 26 });
  let res; try { res = JSON.parse(r.stdout); } catch (e) { assert.fail('Validator-Ausgabe unlesbar: ' + r.stdout + r.stderr); }
  if (res.skipped) { console.log('  (übersprungen: ' + res.skipped + ')'); return; }
  const bad = Object.entries(res).filter(([, v]) => v.xsd.length || v.schematron.length);
  assert.equal(bad.length, 0, JSON.stringify(bad.slice(0, 2), null, 1));
});

test('PDF-Writer: JPEG wird erkannt und eingebettet, kaputte Bilder werfen Fehler', () => {
  assert.throws(() => PDF.parseJpeg(new Uint8Array([1, 2, 3])));
  // minimales 1x1 JPEG
  const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
  const info = PDF.parseJpeg(new Uint8Array(jpeg));
  assert.equal(info.w, 1); assert.equal(info.h, 1);
});
