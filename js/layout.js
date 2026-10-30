/* Klarkontor – Belegdesign (DIN-5008-nah, A4, mehrseitig).
   Erzeugt Seiten mit Zeichenbefehlen in mm (Ursprung oben links). Daraus entstehen PDF (pdf.js) und Vorschau (svg.js). */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const U = isNode ? require('./util.js') : root.KK.util;
  const C = isNode ? require('./calc.js') : root.KK.calc;
  const FM = isNode ? require('./fontmetrics.js') : root.KK.fontmetrics;
  const E = isNode ? require('./epc.js') : root.KK.epc;
  const api = factory(U, C, FM, E);
  root.KK = root.KK || {};
  root.KK.layout = api;
  if (isNode) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function (U, C, FM, E) {
  'use strict';

  const W = 210, H = 297, ML = 25, MR = 20, RIGHT = W - MR, CW = RIGHT - ML;
  const TOP2 = 32, BOTTOM = 266;
  const INK = '#17233B', ACCENT = '#B8863A', MUTED = '#6E6656', LINE = '#DCD6C8', PANEL = '#F6F3EA';

  const width = (s, font, size) => FM.width(s, font, size);

  function wrap(text, font, size, maxW) {
    const out = [];
    for (const para of String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n')) {
      if (!para.trim()) { out.push(''); continue; }
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const test = line ? line + ' ' + word : word;
        if (width(test, font, size) <= maxW) { line = test; continue; }
        if (line) { out.push(line); line = ''; }
        if (width(word, font, size) <= maxW) { line = word; continue; }
        let chunk = ''; // zu langes Wort hart umbrechen
        for (const ch of word) {
          if (width(chunk + ch, font, size) > maxW && chunk) { out.push(chunk); chunk = ''; }
          chunk += ch;
        }
        line = chunk;
      }
      out.push(line);
    }
    return out;
  }

  function fillText(t, doc) {
    const map = { gueltig_bis: U.fmtDate(doc.due), faellig: U.fmtDate(doc.due), nummer: doc.number || '', datum: U.fmtDate(doc.date) };
    return String(t || '').replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
  }

  function clientLines(c) {
    const l = [];
    if (c.name) l.push(c.name);
    if (c.person && c.person !== c.name) l.push(c.person);
    if (c.street) l.push(c.street);
    const cityLine = [c.zip, c.city].filter(Boolean).join(' ');
    if (cityLine) l.push(cityLine);
    if (c.country && c.country !== 'DE') l.push(U.countryName(c.country).toUpperCase());
    return l;
  }
  function companyLines(co) {
    const l = [];
    if (co.owner && co.owner !== co.name) l.push(co.owner);
    if (co.street) l.push(co.street);
    const cityLine = [co.zip, co.city].filter(Boolean).join(' ');
    if (cityLine) l.push(cityLine);
    return l;
  }

  /* ---------- Gerüst: Seiten, Kopf, Fuß ---------- */
  function createPage(settings, meta) {
    const co = settings.company;
    const pages = [{ ops: [] }];
    let cur = pages[0];
    const api = {
      pages, y: 0,
      get page() { return cur; },
      text(x, y, s, o = {}) {
        if (s === '' || s == null) return;
        cur.ops.push({ t: 'text', x, y, s: String(s), font: o.font || 'r', size: o.size || 9.5, color: o.color || INK, anchor: o.anchor || 'start' });
      },
      line(x1, y1, x2, y2, o = {}) { cur.ops.push({ t: 'line', x1, y1, x2, y2, w: o.w || 0.2, color: o.color || LINE }); },
      rect(x, y, w, h, o = {}) { cur.ops.push({ t: 'rect', x, y, w, h, fill: o.fill, stroke: o.stroke, lw: o.lw }); },
      img(id, x, y, w, h) { cur.ops.push({ t: 'img', id, x, y, w, h }); },
      qr(m, x, y, size) { cur.ops.push({ t: 'qr', m, x, y, size }); },
      newPage() {
        cur = { ops: [] };
        pages.push(cur);
        api.text(ML, 15, co.name || '', { font: 'b', size: 8, color: MUTED });
        api.text(RIGHT, 15, meta.running || '', { size: 8, color: MUTED, anchor: 'end' });
        api.line(ML, 18, RIGHT, 18);
        api.y = TOP2;
      },
      ensure(h) { if (api.y + h > BOTTOM) api.newPage(); },
      footers() {
        const cols = [[], [], []];
        if (co.name) cols[0].push(co.name);
        cols[0].push(...companyLines(co));
        if (co.phone) cols[1].push('Tel. ' + co.phone);
        if (co.email) cols[1].push(co.email);
        if (co.website) cols[1].push(co.website);
        if (co.bankName) cols[2].push(co.bankName);
        if (co.iban) cols[2].push('IBAN ' + U.ibanFmt(co.iban));
        if (co.bic) cols[2].push('BIC ' + co.bic);
        if (co.taxNo) cols[2].push('Steuernr. ' + co.taxNo);
        if (co.vatId) cols[2].push('USt-IdNr. ' + co.vatId);
        const xs = [ML, ML + 52, ML + 100];
        pages.forEach((p, i) => {
          cur = p;
          api.line(ML, 272, RIGHT, 272);
          cols.forEach((col, ci) => col.slice(0, 5).forEach((s, li) => api.text(xs[ci], 276 + li * 3.1, s, { size: 7, color: MUTED, font: ci === 0 && li === 0 ? 'b' : 'r' })));
          api.text(RIGHT, 293, `Seite ${i + 1} von ${pages.length}`, { size: 7, color: MUTED, anchor: 'end' });
        });
      },
    };
    return api;
  }

  function header(P, settings, images) {
    const co = settings.company;
    let leftBottom = 14;
    if (images.logo) {
      const maxW = 62, maxH = 22;
      const ratio = images.logo.w / images.logo.h;
      let w = maxW, h = w / ratio;
      if (h > maxH) { h = maxH; w = h * ratio; }
      P.img('logo', ML, 12, w, h);
      leftBottom = 12 + h;
    } else {
      P.text(ML, 18, co.name || 'Ihr Unternehmen', { font: 'b', size: 15, color: INK });
      P.rect(ML, 20.5, 14, 0.7, { fill: ACCENT });
      leftBottom = 22;
    }
    const lines = [];
    if (images.logo && co.name) lines.push({ s: co.name, b: true });
    for (const s of companyLines(co)) lines.push({ s });
    if (co.phone) lines.push({ s: 'Tel. ' + co.phone });
    if (co.email) lines.push({ s: co.email });
    if (co.website) lines.push({ s: co.website });
    lines.forEach((l, i) => P.text(RIGHT, 14 + i * 3.7, l.s, { size: 8, color: l.b ? INK : MUTED, font: l.b ? 'b' : 'r', anchor: 'end' }));
    return leftBottom;
  }

  function addressBlock(P, settings, client) {
    const co = settings.company;
    const sender = [co.name, co.street, [co.zip, co.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
    if (sender) {
      P.text(ML, 49.5, sender, { size: 6.5, color: MUTED });
      P.line(ML, 50.6, ML + 82, 50.6, { color: MUTED, w: 0.15 });
    }
    clientLines(client).slice(0, 6).forEach((s, i) => P.text(ML, 56.5 + i * 4.4, s, { size: 10, font: i === 0 ? 'b' : 'r' }));
  }

  function infoBlock(P, rows) {
    const x = 125;
    rows.filter(r => r[1]).slice(0, 8).forEach((r, i) => {
      P.text(x, 52 + i * 4.6, r[0], { size: 8, color: MUTED });
      P.text(RIGHT, 52 + i * 4.6, r[1], { size: 9, anchor: 'end', font: r[2] ? 'b' : 'r' });
    });
  }

  /* ---------- Belege ---------- */
  function layoutDocument(doc, settings, opts = {}) {
    const co = settings.company;
    const images = {};
    if (co.logo && co.logoW && co.logoH) images.logo = { w: co.logoW, h: co.logoH, dataUrl: co.logo };
    const inv = doc.type === 'invoice', storno = C.isStorno(doc), quote = doc.type === 'quote';
    const calc = C.compute(doc);
    const label = C.typeLabel(doc);
    const meta = { running: `${label} ${doc.number || '(Entwurf)'}` };
    const P = createPage(settings, meta);

    header(P, settings, images);
    addressBlock(P, settings, doc.client);

    const period = doc.serviceEnd && doc.serviceDate ? `${U.fmtDate(doc.serviceDate)} – ${U.fmtDate(doc.serviceEnd)}` : U.fmtDate(doc.serviceDate || (inv && doc.status !== 'draft' ? doc.date : ''));
    infoBlock(P, [
      [quote ? 'Angebots-Nr.' : storno ? 'Storno-Nr.' : 'Rechnungs-Nr.', doc.number || 'wird vergeben', true],
      ['Datum', U.fmtDate(doc.date)],
      inv && !storno ? ['Leistungsdatum', period] : null,
      quote ? ['Gültig bis', U.fmtDate(doc.due)] : (inv && !storno ? ['Zahlbar bis', U.fmtDate(doc.due)] : null),
      doc.reference ? ['Ihr Zeichen', doc.reference] : null,
      doc.client.buyerRef ? ['Käuferreferenz', doc.client.buyerRef] : null,
    ].filter(Boolean));

    // Titel
    let y = 98;
    P.text(ML, y, `${label}${doc.number ? ' ' + doc.number : ' (Entwurf)'}`, { font: 'b', size: 14 });
    y += 6;
    if (doc.title) { P.text(ML, y, doc.title, { font: 'b', size: 10.5 }); y += 5; }
    y += 3;

    // Anrede + Einleitung
    const salutation = (doc.client.salutation || '').trim() || 'Sehr geehrte Damen und Herren';
    P.text(ML, y, salutation + ',', { size: 9.5 }); y += 5.2;
    for (const l of wrap(fillText(doc.intro, doc), 'r', 9.5, CW)) { P.text(ML, y, l, { size: 9.5 }); y += 4.3; }
    y += 3;
    P.y = y;

    // Tabelle
    const showVat = !doc.klein;
    const colTotal = RIGHT, colPrice = RIGHT - 24, colVat = RIGHT - 45, colQty = showVat ? RIGHT - 62 : RIGHT - 45;
    const descX = ML + 7, descW = (colQty - 21) - descX;
    const th = () => {
      P.text(ML, P.y + 3, 'Pos.', { size: 7.5, font: 'b', color: MUTED });
      P.text(descX, P.y + 3, 'Beschreibung', { size: 7.5, font: 'b', color: MUTED });
      P.text(colQty, P.y + 3, 'Menge', { size: 7.5, font: 'b', color: MUTED, anchor: 'end' });
      if (showVat) P.text(colVat, P.y + 3, 'USt.', { size: 7.5, font: 'b', color: MUTED, anchor: 'end' });
      P.text(colPrice, P.y + 3, 'Einzelpreis', { size: 7.5, font: 'b', color: MUTED, anchor: 'end' });
      P.text(colTotal, P.y + 3, 'Gesamt', { size: 7.5, font: 'b', color: MUTED, anchor: 'end' });
      P.line(ML, P.y + 5, RIGHT, P.y + 5, { color: INK, w: 0.4 });
      P.y += 5;
    };
    P.ensure(30);
    th();
    doc.items.forEach((it, i) => {
      const ln = calc.lines[i];
      const descLines = [];
      const [first, ...rest] = String(it.desc || '').split('\n');
      for (const l of wrap(first, 'b', 9.2, descW)) descLines.push({ s: l, f: 'b' });
      if (rest.join('').trim()) for (const l of wrap(rest.join('\n').trim(), 'r', 8.6, descW)) descLines.push({ s: l, f: 'r' });
      if (!descLines.length) descLines.push({ s: '', f: 'r' });
      const h = 2.6 * 2 + descLines.length * 4.1;
      if (P.y + h > BOTTOM) { P.newPage(); th(); }
      const base = P.y + 2.6 + 3;
      P.text(ML, base, String(i + 1), { size: 9, color: MUTED });
      descLines.forEach((l, k) => P.text(descX, base + k * 4.1, l.s, { size: l.f === 'b' ? 9.2 : 8.6, font: l.f, color: l.f === 'b' ? INK : MUTED }));
      P.text(colQty, base, `${U.fmtNum(it.qty)} ${C.unitOf(it.unit).label}`, { size: 9, anchor: 'end' });
      if (showVat) P.text(colVat, base, `${ln.rate} %`, { size: 9, anchor: 'end' });
      P.text(colPrice, base, U.eur(ln.price), { size: 9, anchor: 'end' });
      P.text(colTotal, base, U.eur(ln.net), { size: 9, anchor: 'end' });
      P.y += h;
      P.line(ML, P.y, RIGHT, P.y);
    });
    P.y += 3;

    // Summen
    const rows = [];
    const d = doc.discount;
    if (d && d.value && calc.allowanceTotal !== 0) {
      rows.push({ l: 'Zwischensumme', v: U.eur(calc.lineTotal) });
      rows.push({ l: d.mode === 'percent' ? `Rabatt ${U.fmtNum(d.value / 100)} %` : 'Rabatt', v: U.eur(-calc.allowanceTotal) });
    }
    if (showVat) {
      rows.push({ l: 'Nettobetrag', v: U.eur(calc.net), tight: true });
      for (const g of calc.groups) rows.push({ l: `zzgl. ${g.rate} % USt. auf ${U.eur(g.taxable)}`, v: U.eur(g.vat) });
    }
    const totalLabel = storno ? 'Erstattungsbetrag' : quote ? 'Gesamtbetrag' : 'Rechnungsbetrag';
    P.ensure(rows.length * 4.8 + 14);
    for (const r of rows) {
      P.text(ML + 85, P.y + 3.4, r.l, { size: 9, color: MUTED });
      P.text(RIGHT, P.y + 3.4, r.v, { size: 9, anchor: 'end' });
      P.y += 4.8;
    }
    P.y += 1;
    P.line(ML + 85, P.y, RIGHT, P.y, { color: INK, w: 0.4 });
    P.text(ML + 85, P.y + 5.4, totalLabel, { size: 10.5, font: 'b' });
    P.text(RIGHT, P.y + 5.4, U.eur(calc.gross), { size: 11, font: 'b', anchor: 'end' });
    P.y += 11;

    // Hinweise
    const notes = [];
    if (doc.klein) notes.push('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).');
    if (storno) notes.push(`Diese Stornorechnung bezieht sich auf die Rechnung ${(doc.reference || '').replace('Storno zu Rechnung ', '')}.`);
    for (const n of notes) {
      const ls = wrap(n, 'i', 8.5, CW);
      P.ensure(ls.length * 4 + 2);
      ls.forEach(l => { P.text(ML, P.y + 3, l, { size: 8.5, font: 'i', color: MUTED }); P.y += 4; });
      P.y += 1.5;
    }

    // Schlusstext
    const closing = wrap(fillText(doc.closing, doc), 'r', 9.5, CW);
    P.ensure(closing.length * 4.3 + 4);
    P.y += 2;
    for (const l of closing) { P.text(ML, P.y + 3.2, l, { size: 9.5 }); P.y += 4.3; }
    P.y += 3;

    // Grußformel
    if (!storno) {
      P.ensure(17);
      P.text(ML, P.y + 3.5, 'Mit freundlichen Grüßen', { size: 9.5 });
      P.text(ML, P.y + 14, co.owner || co.name || '', { size: 9.5, font: 'b' });
      P.y += 16;
    }

    // Zahlungsinformationen + GiroCode
    if (inv && !storno && calc.gross > 0 && co.iban) {
      const gc = E.giroCode({ name: co.name, iban: co.iban, bic: co.bic, amountCents: calc.gross, text: `Rechnung ${doc.number || ''}`.trim() });
      const boxH = gc ? 32 : 24;
      P.ensure(boxH + 4);
      P.rect(ML, P.y, CW, boxH, { fill: PANEL });
      const x0 = ML + 5;
      P.text(x0, P.y + 6.2, 'Zahlungsinformationen', { font: 'b', size: 9 });
      const info = [
        ['Empfänger', co.name], ['IBAN', U.ibanFmt(co.iban)], co.bic ? ['BIC', co.bic] : null, co.bankName ? ['Bank', co.bankName] : null,
        ['Verwendungszweck', doc.number || 'Rechnungsnummer (wird vergeben)'], ['Betrag', U.eur(calc.gross)],
      ].filter(Boolean);
      info.slice(0, 6).forEach((r, i) => {
        P.text(x0, P.y + 11.5 + i * 3.9, r[0], { size: 8, color: MUTED });
        P.text(x0 + 32, P.y + 11.5 + i * 3.9, r[1], { size: 8.5 });
      });
      if (gc) {
        P.rect(RIGHT - 29, P.y + 3.5, 23, 23, { fill: '#FFFFFF' });
        P.qr(gc.matrix, RIGHT - 28, P.y + 4.5, 21);
        P.text(RIGHT - 17.5, P.y + 29.5, 'GiroCode scannen', { size: 6, color: MUTED, anchor: 'middle' });
      }
      P.y += boxH + 5;
    }

    P.footers();
    return { width: W, height: H, pages: P.pages, images, calc, title: `${label} ${doc.number || '(Entwurf)'}` };
  }

  /* ---------- Mahnschreiben ---------- */
  function dunningTexts(level, doc, calc, d, settings) {
    const co = settings.company;
    const due = U.fmtDate(doc.due);
    const nextDays = C.DUNNING_LEVELS[level].days;
    const deadline = U.fmtDate(U.addDays(d.date, nextDays));
    const inv = `Rechnung ${doc.number} vom ${U.fmtDate(doc.date)}`;
    if (level === 0) return {
      title: 'Zahlungserinnerung',
      paras: [
        `bei der Durchsicht meiner Buchhaltung ist mir aufgefallen, dass die ${inv} noch nicht beglichen wurde. Der Betrag war am ${due} fällig.`,
        'Sicherlich handelt es sich nur um ein Versehen. Falls Sie den Betrag bereits überwiesen haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.',
        `Ich bitte Sie, den offenen Betrag bis zum ${deadline} zu überweisen.`,
      ],
    };
    if (level === 1) return {
      title: '1. Mahnung',
      paras: [
        `trotz Zahlungserinnerung konnte ich zur ${inv} bisher keinen Zahlungseingang feststellen. Die Rechnung war am ${due} fällig; Sie befinden sich damit in Zahlungsverzug.`,
        `Bitte überweisen Sie den unten genannten Gesamtbetrag bis zum ${deadline}.`,
      ],
    };
    return {
      title: '2. Mahnung',
      paras: [
        `leider ist auch auf meine bisherigen Schreiben hin kein Zahlungseingang zur ${inv} erfolgt.`,
        `Ich fordere Sie letztmalig auf, den unten genannten Gesamtbetrag bis zum ${deadline} zu überweisen. Andernfalls behalte ich mir vor, ohne weitere Ankündigung gerichtliche Schritte einzuleiten; dadurch entstehende Kosten gehen zu Ihren Lasten.`,
      ],
    };
  }

  function layoutDunning(doc, settings, level, dateIso, opts = {}) {
    const co = settings.company;
    const images = {};
    if (co.logo && co.logoW && co.logoH) images.logo = { w: co.logoW, h: co.logoH, dataUrl: co.logo };
    const d = { date: dateIso };
    const dn = C.calcDunning(doc, settings, level, dateIso);
    const tx = dunningTexts(level, doc, dn, d, settings);
    const P = createPage(settings, { running: `${tx.title} zu Rechnung ${doc.number}` });
    header(P, settings, images);
    addressBlock(P, settings, doc.client);
    infoBlock(P, [['Datum', U.fmtDate(dateIso)], ['Rechnungs-Nr.', doc.number, true], ['Rechnungsdatum', U.fmtDate(doc.date)], ['Fällig seit', U.fmtDate(doc.due)]]);

    let y = 98;
    P.text(ML, y, `${tx.title} – Rechnung ${doc.number}`, { font: 'b', size: 14 }); y += 9;
    P.text(ML, y, ((doc.client.salutation || '').trim() || 'Sehr geehrte Damen und Herren') + ',', { size: 9.5 }); y += 5.4;
    for (const p of tx.paras) {
      for (const l of wrap(p, 'r', 9.5, CW)) { P.text(ML, y, l, { size: 9.5 }); y += 4.3; }
      y += 2.5;
    }
    y += 2;
    P.y = y;

    const rows = [[`Offener Rechnungsbetrag (${doc.number})`, U.eur(dn.open)]];
    if (dn.fee) rows.push([level === 0 ? 'Mahngebühr' : level === 1 ? 'Mahngebühr (1. Mahnung)' : 'Mahngebühr (2. Mahnung)', U.eur(dn.fee)]);
    if (dn.lumpSum) rows.push(['Verzugspauschale gem. § 288 Abs. 5 BGB', U.eur(dn.lumpSum)]);
    if (dn.interestRate != null && dn.interest) rows.push([`Verzugszinsen ${U.fmtNum(dn.interestRate)} % p. a. für ${dn.days} Tage`, U.eur(dn.interest)]);
    P.ensure(rows.length * 5 + 16);
    P.line(ML, P.y, RIGHT, P.y, { color: INK, w: 0.4 });
    P.y += 1;
    for (const r of rows) { P.text(ML + 2, P.y + 4, r[0], { size: 9.5 }); P.text(RIGHT, P.y + 4, r[1], { size: 9.5, anchor: 'end' }); P.y += 5.2; P.line(ML, P.y, RIGHT, P.y); }
    P.y += 1.5;
    P.text(ML + 2, P.y + 5, 'Zu zahlender Gesamtbetrag', { size: 10.5, font: 'b' });
    P.text(RIGHT, P.y + 5, U.eur(dn.total), { size: 11, font: 'b', anchor: 'end' });
    P.y += 11;

    if (level >= 1 && dn.interestRate == null) {
      const ls = wrap('Hinweis: Weitere Verzugszinsen und Kosten bleiben vorbehalten.', 'i', 8.5, CW);
      ls.forEach(l => { P.text(ML, P.y + 3, l, { size: 8.5, font: 'i', color: MUTED }); P.y += 4; });
      P.y += 2;
    }

    if (co.iban && dn.total > 0) {
      const gc = E.giroCode({ name: co.name, iban: co.iban, bic: co.bic, amountCents: dn.total, text: `${tx.title} Rechnung ${doc.number}` });
      const boxH = gc ? 32 : 22;
      P.ensure(boxH + 4);
      P.rect(ML, P.y, CW, boxH, { fill: PANEL });
      const x0 = ML + 5;
      P.text(x0, P.y + 6.2, 'Zahlungsinformationen', { font: 'b', size: 9 });
      [['Empfänger', co.name], ['IBAN', U.ibanFmt(co.iban)], co.bic ? ['BIC', co.bic] : null, ['Verwendungszweck', `Rechnung ${doc.number}`], ['Betrag', U.eur(dn.total)]].filter(Boolean).forEach((r, i) => {
        P.text(x0, P.y + 11.5 + i * 3.9, r[0], { size: 8, color: MUTED });
        P.text(x0 + 32, P.y + 11.5 + i * 3.9, r[1], { size: 8.5 });
      });
      if (gc) {
        P.rect(RIGHT - 29, P.y + 3.5, 23, 23, { fill: '#FFFFFF' });
        P.qr(gc.matrix, RIGHT - 28, P.y + 4.5, 21);
        P.text(RIGHT - 17.5, P.y + 29.5, 'GiroCode scannen', { size: 6, color: MUTED, anchor: 'middle' });
      }
      P.y += boxH + 5;
    }
    P.ensure(22);
    P.text(ML, P.y + 3.5, 'Mit freundlichen Grüßen', { size: 9.5 });
    P.text(ML, P.y + 14, co.owner || co.name || '', { size: 9.5, font: 'b' });
    P.footers();
    return { width: W, height: H, pages: P.pages, images, dunning: dn, title: `${tx.title} ${doc.number}` };
  }

  return { layoutDocument, layoutDunning, wrap, fillText, W, H, ML, RIGHT, BOTTOM };
});
