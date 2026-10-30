const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright');
const start = require('./server.js');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'tests', 'out', 'shots');
fs.mkdirSync(OUT, { recursive: true });
let server, browser, base;

test.before(async () => { ({ srv: server, url: base } = await start(ROOT)); browser = await chromium.launch(); });
test.after(async () => { await browser.close(); server.close(); });

async function open(opts = {}, url = '/app.html') {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'de-DE', acceptDownloads: true, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('requestfailed', r => errors.push('REQFAIL ' + r.url()));
  page.on('dialog', d => d.accept());
  await page.goto((opts.file ? '' : base) + url);
  await page.waitForSelector('#view h1');
  return { ctx, page, errors };
}
const setField = async (page, sel, v) => { const l = page.locator(sel); await l.fill(v); await l.blur(); };
async function setupCompany(page, extra = {}) {
  await page.goto(base + '/app.html#/einstellungen/unternehmen');
  await page.waitForSelector('[data-s="settings.company.name"]');
  const v = { name: 'Muster Webdesign', owner: 'Maria Muster', street: 'Beispielweg 12', zip: '10115', city: 'Berlin', email: 'maria@muster.example', phone: '030 123456', taxNo: '12/345/67890', iban: 'DE89 3704 0044 0532 0130 00', ...extra };
  for (const [k, val] of Object.entries(v)) await setField(page, `[data-s="settings.company.${k}"]`, val);
}
async function newContact(page, data) {
  await page.locator('#newBtn').click(); await page.locator('[data-new="contact"]').first().click();
  const dlg = page.locator('dialog');
  for (const [k, v] of Object.entries(data)) await dlg.locator(`[name="${k}"]`).fill(v);
  await dlg.getByRole('button', { name: 'Kontakt anlegen' }).click();
  await page.waitForSelector('dialog', { state: 'detached' });
}
const noErrors = (errors) => assert.deepEqual(errors, [], 'Konsolenfehler:\n' + errors.join('\n'));

test('Daten bleiben nach dem Neuladen erhalten (localStorage)', async () => {
  const { ctx, page, errors } = await open();
  await setupCompany(page);
  assert.match(await page.locator('#complete').innerText(), /Alle Pflichtangaben/);
  await page.reload(); await page.waitForSelector('[data-s="settings.company.name"]');
  assert.equal(await page.locator('[data-s="settings.company.name"]').inputValue(), 'Muster Webdesign');
  assert.equal(await page.locator('#iban').inputValue(), 'DE89 3704 0044 0532 0130 00');
  assert.equal(await page.locator('#banners .banner.bad').count(), 0, 'kein „nicht gespeichert“-Banner');
  noErrors(errors); await ctx.close();
});

test('Kompletter Ablauf: Kontakt → Angebot → Rechnung → PDF/XRechnung → Zahlung → Übersicht', async () => {
  const { ctx, page, errors } = await open();
  await setupCompany(page);
  await page.goto(base + '/app.html#/kontakte'); await page.waitForSelector('#newContact2, #newContact');
  await newContact(page, { name: 'Schreinerei Huber', person: 'Thomas Huber', salutation: 'Sehr geehrter Herr Huber', email: 'huber@schreinerei.example', street: 'Holzweg 3', zip: '80331', city: 'München' });
  await page.locator('.kcard', { hasText: 'Schreinerei Huber' }).click();
  await page.locator('dialog #mkQuote').click();
  await page.waitForSelector('#items .item');
  assert.match(page.url(), /#\/beleg\//);
  assert.equal(await page.locator('[data-f="client.name"]').inputValue(), 'Schreinerei Huber');
  await page.locator('[data-k="desc"]').fill('Website-Relaunch\nKonzept und Umsetzung');
  await setField(page, '[data-k="price"]', '1.500,00');
  assert.match(await page.locator('#summary').innerText(), /1\.500,00/);
  await page.waitForFunction(() => (document.querySelector('#preview') || {}).textContent.includes('Website-Relaunch'));
  await page.getByRole('button', { name: 'Festschreiben' }).click();
  await page.locator('dialog').getByRole('button', { name: 'Festschreiben' }).click();
  await page.waitForFunction(() => /Angebot AN-\d{4}-001/.test(document.querySelector('h1').textContent));
  assert.match(await page.locator('.page-head').innerText(), /festgeschrieben/);
  // Angebot → Rechnung
  await page.locator('[data-do="q2i"]').click();
  await page.waitForFunction(() => /Neue Rechnung/.test(document.querySelector('h1').textContent));
  assert.equal(await page.locator('[data-k="desc"]').inputValue(), 'Website-Relaunch\nKonzept und Umsetzung');
  await page.getByRole('button', { name: 'Festschreiben' }).click();
  await page.locator('dialog').getByRole('button', { name: 'Festschreiben' }).click();
  await page.waitForFunction(() => /Rechnung RE-\d{4}-001/.test(document.querySelector('h1').textContent));
  // PDF
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.locator('.page-head [data-do="pdf"]').click()]);
  assert.match(pdf.suggestedFilename(), /^Rechnung_RE-\d{4}-001_Schreinerei_Huber\.pdf$/);
  const pdfPath = await pdf.path();
  assert.equal(fs.readFileSync(pdfPath).subarray(0, 5).toString(), '%PDF-');
  const txt = spawnSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' }).stdout;
  for (const s of ['Schreinerei Huber', '1.500,00 €', 'Website-Relaunch', 'DE89 3704 0044 0532 0130 00', '§ 19 UStG']) assert.ok(txt.includes(s), 'PDF enthält nicht: ' + s);
  // XRechnung
  await page.locator('.page-head .menu-wrap [data-menu-toggle]').click();
  await page.getByRole('button', { name: /XRechnung \(XML\)/ }).click();
  await page.waitForSelector('dialog #chk .callout.good');
  const [xml] = await Promise.all([page.waitForEvent('download'), page.locator('dialog').getByRole('button', { name: 'XML herunterladen' }).click()]);
  assert.match(xml.suggestedFilename(), /^RE-\d{4}-001_xrechnung\.xml$/);
  const x = fs.readFileSync(await xml.path(), 'utf8');
  assert.ok(x.includes('<ram:GrandTotalAmount>1500.00</ram:GrandTotalAmount>') && x.includes('huber@schreinerei.example') && x.includes('xrechnung_3.0'));
  // Zahlung → bezahlt → Übersicht
  await page.locator('[data-do="markpaid"]').click();
  await page.waitForFunction(() => /Bezahlt/.test(document.querySelector('.page-head .badge').textContent));
  await page.goto(base + '/app.html#/'); await page.waitForSelector('.kpi');
  assert.match(await page.locator('.kpi', { hasText: 'Umsatz' }).innerText(), /1\.500,00/);
  assert.match(await page.locator('.kpi', { hasText: 'Offene Forderungen' }).innerText(), /0,00/);
  await page.screenshot({ path: path.join(OUT, 'flow-dashboard.png'), fullPage: true });
  noErrors(errors); await ctx.close();
});

test('Festgeschriebener Beleg ist gesperrt; Entwurf speichert automatisch', async () => {
  const { ctx, page, errors } = await open();
  await setupCompany(page);
  await page.locator('#newBtn').click(); await page.locator('[data-new="invoice"]').first().click();
  await page.waitForSelector('#items .item');
  await page.locator('[data-f="client.name"]').fill('Autosave GmbH');
  await page.locator('[data-k="desc"]').fill('Leistung X');
  await page.waitForTimeout(700); // Entprellung
  await page.goto(base + '/app.html#/belege');
  await page.waitForSelector('table.table');
  assert.match(await page.locator('tbody').innerText(), /Autosave GmbH/);
  await page.locator('tr', { hasText: 'Autosave GmbH' }).click();
  await page.waitForSelector('#items .item');
  assert.equal(await page.locator('[data-k="desc"]').inputValue(), 'Leistung X');
  // Pflichtangaben fehlen → Dialog statt Festschreiben
  await page.getByRole('button', { name: 'Festschreiben' }).click();
  assert.match(await page.locator('dialog').innerText(), /Anschrift des Empfängers/);
  await page.locator('dialog').getByRole('button', { name: 'Zurück zum Beleg' }).click();
  noErrors(errors); await ctx.close();
});

test('Sicherheit: Nutzereingaben werden nie als HTML ausgeführt (XSS)', async () => {
  const { ctx, page, errors } = await open();
  const evil = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
  await setupCompany(page, { name: evil });
  await page.goto(base + '/app.html#/kontakte'); await page.waitForSelector('#newContact2, #newContact');
  await newContact(page, { name: evil, notes: evil });
  await page.goto(base + '/app.html#/'); await page.waitForSelector('.kpi');
  await page.locator('#newBtn').click(); await page.locator('[data-new="invoice"]').first().click();
  await page.waitForSelector('#items .item');
  await page.locator('[data-k="desc"]').fill(evil);
  await page.locator('[data-f="title"]').fill(evil);
  await page.waitForTimeout(400);
  await page.goto(base + '/app.html#/belege'); await page.waitForSelector('table.table');
  await page.goto(base + '/app.html#/kontakte'); await page.waitForSelector('.kcard');
  assert.equal(await page.evaluate(() => window.__xss), undefined, 'Skript wurde ausgeführt');
  assert.equal(await page.locator('#view img[src="x"]').count(), 0);
  assert.match(await page.locator('.kcard').first().innerText(), /<img src=x/);
  // Ein Teil der Meldungen (blockierte Inline-Handler per CSP) ist hier erwartbar – ausgeführt werden darf nichts
  await ctx.close();
});

test('Sicherung: Export → alles löschen → Import stellt Daten wieder her', async () => {
  const { ctx, page, errors } = await open();
  await page.locator('[data-act="demo"]').click(); await page.waitForSelector('.kpi');
  await page.goto(base + '/app.html#/einstellungen/daten'); await page.waitForSelector('#backup');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#backup').click()]);
  const file = await dl.path();
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(data.app, 'klarkontor'); assert.ok(data.state.documents.length >= 8);
  await page.locator('#wipe').click();
  await page.locator('dialog [name="c"]').fill('löschen');
  await page.locator('dialog').getByRole('button', { name: 'Endgültig löschen' }).click();
  await page.waitForSelector('dialog', { state: 'detached' });
  await page.goto(base + '/app.html#/belege'); await page.waitForSelector('.empty');
  await page.goto(base + '/app.html#/einstellungen/daten'); await page.waitForSelector('#restoreFile');
  await page.locator('#restoreFile').setInputFiles(file);
  await page.locator('dialog [value="replace"]').check();
  await page.locator('dialog').getByRole('button', { name: 'Einspielen' }).click();
  await page.waitForSelector('dialog', { state: 'detached' });
  await page.goto(base + '/app.html#/belege'); await page.waitForSelector('table.table');
  assert.match(await page.locator('tbody').innerText(), /Schreinerei Huber/);
  noErrors(errors); await ctx.close();
});

test('Logo-Upload: erscheint in Vorschau und im PDF', async () => {
  const { ctx, page, errors } = await open();
  await setupCompany(page);
  const { PNG } = require('pngjs'); const png = new PNG({ width: 400, height: 120 });
  for (let i = 0; i < png.data.length; i += 4) { png.data[i] = 23; png.data[i + 1] = 35; png.data[i + 2] = 59; png.data[i + 3] = (i / 4 % 400) < 200 ? 255 : 0; }
  const f = path.join(os.tmpdir(), 'kk-logo.png'); fs.writeFileSync(f, PNG.sync.write(png));
  await page.locator('#logoFile').setInputFiles(f);
  await page.waitForSelector('img.logo-preview');
  await page.locator('#newBtn').click(); await page.locator('[data-new="quote"]').first().click();
  await page.waitForSelector('#preview svg image');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.page-head [data-do="pdf"]').click()]);
  const p = await dl.path();
  const imgs = spawnSync('pdfimages', ['-list', p], { encoding: 'utf8' }).stdout;
  assert.match(imgs, /jpeg|image/i); assert.ok(imgs.split('\n').filter(l => /^\s*1\s/.test(l)).length >= 1, imgs);
  noErrors(errors); await ctx.close();
});

test('Kontakte: Status per Pfeil ändern, Suche, Liste', async () => {
  const { ctx, page, errors } = await open();
  await page.locator('[data-act="demo"]').click(); await page.waitForSelector('.kpi');
  await page.goto(base + '/app.html#/kontakte'); await page.waitForSelector('.kcard');
  const card = page.locator('.kcard', { hasText: 'Steuerbüro Lindner' });
  await card.locator('[data-dir="1"]').click();
  await page.waitForSelector('.col[data-stage="Angeschrieben"] .kcard:has-text("Steuerbüro Lindner")');
  await page.locator('#q').fill('lotus'); await page.waitForTimeout(400);
  assert.equal(await page.locator('.kcard').count(), 1);
  await page.locator('[data-mode="list"]').click(); await page.waitForSelector('table.table');
  assert.match(await page.locator('tbody').innerText(), /Yogastudio Lotus/);
  noErrors(errors); await ctx.close();
});

test('Handy-Ansicht: untere Navigation, Editor mit Tabs, kein Seitwärts-Scrollen', async () => {
  const { ctx, page, errors } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.locator('[data-act="demo"]').click(); await page.waitForSelector('.kpi');
  const nav = await page.locator('.side').boundingBox();
  assert.ok(nav.y > 700, 'Navigation unten');
  for (const h of ['#/', '#/kontakte', '#/belege', '#/einstellungen/unternehmen', '#/einstellungen/steuer', '#/einstellungen/daten', '#/hilfe']) {
    await page.goto(base + '/app.html' + h); await page.waitForSelector('#view h1');
    // clientWidth statt innerWidth: In der Mobil-Emulation wächst innerWidth mit überbreitem Inhalt mit
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `${h}: horizontaler Überlauf ${overflow}px`);
  }
  await page.goto(base + '/app.html#/belege'); await page.locator('tbody tr').nth(1).click(); await page.waitForSelector('.mobile-tabs');
  await page.screenshot({ path: path.join(OUT, 'mobile-beleg.png') });
  await page.locator('.mobile-tabs [data-pane="preview"]').click();
  await page.waitForSelector('#preview .sheet-page svg');
  assert.ok((await page.locator('#preview .sheet-page').first().boundingBox()).width > 300);
  await page.screenshot({ path: path.join(OUT, 'mobile-preview.png') });
  noErrors(errors); await ctx.close();
});

test('Funktioniert auch per Doppelklick (file://) ohne Fehler', async () => {
  const { ctx, page, errors } = await open({ file: true }, 'file://' + path.join(ROOT, 'app.html'));
  await page.locator('[data-act="demo"]').click(); await page.waitForSelector('.kpi');
  await page.goto('file://' + path.join(ROOT, 'app.html') + '#/belege'); await page.waitForSelector('table.table');
  assert.ok(await page.locator('tbody tr').count() >= 8);
  noErrors(errors.filter(e => !/serviceWorker|manifest/i.test(e))); await ctx.close();
});

test('Barrierefreiheit (axe-core): keine schweren Verstöße in den Hauptansichten', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'de-DE', bypassCSP: true });
  const page = await ctx.newPage();
  await page.goto(base + '/app.html'); await page.waitForSelector('#view h1');
  await page.locator('[data-act="demo"]').click(); await page.waitForSelector('.kpi');
  const [doc, draft] = await page.evaluate(() => { const ds = KK.app.store.state.documents; return [ds.find(d => d.status === 'final' && d.type === 'invoice').id, ds.find(d => d.status === 'draft').id]; });
  const views = ['#/', '#/kontakte', '#/belege', '#/beleg/' + doc, '#/beleg/' + draft, '#/einstellungen/unternehmen', '#/einstellungen/steuer', '#/einstellungen/texte', '#/einstellungen/mahnwesen', '#/einstellungen/daten', '#/hilfe', '#/kontakte/drawer'];
  const bad = [];
  for (const v of views) {
    if (v === '#/kontakte/drawer') { await page.goto(base + '/app.html#/kontakte'); await page.waitForSelector('.kcard'); await page.locator('.kcard .n').first().click(); await page.waitForSelector('dialog[open]'); }
    else { await page.goto(base + '/app.html' + v); await page.waitForSelector('#view h1'); }
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    const res = await page.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] }));
    for (const x of res.violations.filter(x => ['serious', 'critical'].includes(x.impact))) bad.push(`${v}: ${x.id} (${x.impact}) – ${x.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`);
  }
  await ctx.close();
  assert.deepEqual(bad, [], bad.join('\n'));
});
