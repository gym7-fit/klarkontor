/* Klarkontor – Beleg-Editor: Entwurf bearbeiten, festschreiben, PDF/E-Rechnung, Zahlungen, Mahnungen, Storno */
(function (root) {
  'use strict';
  const KK = root.KK, U = KK.util, C = KK.calc, D = KK.domain, S = KK.store, ui = KK.ui, L = KK.layout, EI = KK.einvoice;
  const { html, raw } = U;
  KK.views = KK.views || {};

  const slug = s => U.safeFile(s).slice(0, 40);

  KK.views.editor = {
    manual: true, // Editor aktualisiert sich selbst; kein Neuaufbau bei Speicher-Ereignissen
    render(el, params, ctx) {
      const store = ctx.store, st = store.state, set = st.settings;
      const doc = D.byId(st.documents, params[0]);
      if (!doc) {
        el.innerHTML = html`<div class="card empty"><h3>Beleg nicht gefunden</h3><div>Er wurde möglicherweise gelöscht.</div><a class="btn primary" href="#/belege">Zu den Belegen</a></div>`.toString();
        return;
      }
      const draft = doc.status === 'draft';
      const inv = doc.type === 'invoice', quote = doc.type === 'quote', storno = C.isStorno(doc);
      const today = U.today();
      let previewTimer = null, persistTimer = null, dirty = false;

      /* ---------- Speichern (entprellt) ---------- */
      const persistNow = () => { clearTimeout(persistTimer); persistTimer = null; if (dirty) { dirty = false; store.commit('doc:edit'); } };
      const touch = () => { dirty = true; clearTimeout(persistTimer); persistTimer = setTimeout(persistNow, 450); schedulePreview(); updateSummary(); };
      KK.flush = persistNow;

      /* ---------- Hilfen ---------- */
      const fileBase = () => `${C.typeLabel(doc)}_${doc.number || 'Entwurf'}_${slug(doc.client.name)}`;
      const original = () => doc.cancelsId ? D.byId(st.documents, doc.cancelsId) : null;
      const makeLayout = () => L.layoutDocument(doc, set);
      function pdfBytes(opts = {}) {
        const layout = makeLayout();
        const o = { author: set.company.name, subject: layout.title };
        if (opts.xml) { o.xml = opts.xml; o.xmlName = 'factur-x.xml'; }
        return KK.docpdf.toPdf(layout, o);
      }
      const pdfBlob = bytes => new Blob([bytes], { type: 'application/pdf' });
      function downloadPdf() {
        persistNow();
        ui.download(fileBase() + '.pdf', pdfBlob(pdfBytes()));
      }
      function openPdf() { persistNow(); ui.openBlob(pdfBlob(pdfBytes())); }

      /* ---------- Vorschau ---------- */
      function renderPreview() {
        const box = el.querySelector('#preview'); if (!box) return;
        try {
          const lay = makeLayout();
          box.innerHTML = lay.pages.map((p, i) => `<div class="sheet-page" aria-label="Seite ${i + 1} von ${lay.pages.length}">${KK.svg.pageSvg(p, lay)}</div>`).join('');
        } catch (e) { console.error(e); box.innerHTML = `<div class="callout bad">Vorschau nicht möglich: ${U.esc(e.message)}</div>`; }
      }
      function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 90); }

      /* ---------- Summen ---------- */
      function sumHtml() {
        const c = C.compute(doc);
        const rows = [];
        if (c.allowanceTotal) { rows.push(['Zwischensumme', U.eur(c.lineTotal)], ['Rabatt', U.eur(-c.allowanceTotal)]); }
        if (!doc.klein) { rows.push(['Netto', U.eur(c.net)]); c.groups.forEach(g => rows.push([`USt. ${g.rate} %`, U.eur(g.vat)])); }
        return html`<div class="sum-card">${rows.map(r => html`<div class="r"><span>${r[0]}</span><span>${r[1]}</span></div>`)}<div class="r t"><span>${storno ? 'Erstattungsbetrag' : 'Gesamtbetrag'}</span><span>${U.eur(c.gross)}</span></div></div>`.toString();
      }
      function updateSummary() {
        const s = el.querySelector('#summary'); if (s) s.innerHTML = sumHtml();
        const c = C.compute(doc);
        doc.items.forEach((it, i) => { const t = el.querySelector(`[data-total="${i}"]`); if (t) t.textContent = U.eur(c.lines[i].net); });
      }

      /* ---------- Kopf ---------- */
      const stateObj = C.docState(doc, today);
      const title = draft ? `Neue${quote ? 's Angebot' : ' Rechnung'}` : C.docTitle(doc);
      const nextNumber = () => C.peekNumber(set.numbering[doc.type], U.yearOf(doc.date), new Set(st.documents.map(d => d.number).filter(Boolean))).number;

      function headerHtml() {
        const more = [];
        if (!draft) {
          more.push(html`<button type="button" data-do="openpdf">${ui.icon('eye')} PDF im Browser öffnen / drucken</button>`);
          if (inv) {
            more.push(html`<hr>`, html`<button type="button" data-do="xrechnung">${ui.icon('code')} E-Rechnung als XRechnung (XML)</button>`, html`<button type="button" data-do="zugferd">${ui.icon('file')} PDF mit eingebetteter E-Rechnung (ZUGFeRD)</button>`);
          }
          more.push(html`<hr>`, html`<button type="button" data-do="duplicate">${ui.icon('copy')} Duplizieren</button>`);
          if (inv && !storno && doc.status === 'final') more.push(html`<button type="button" class="danger" data-do="cancel">${ui.icon('undo')} Rechnung stornieren</button>`);
        } else {
          more.push(html`<button type="button" data-do="openpdf">${ui.icon('eye')} Entwurf als PDF öffnen</button>`, html`<hr>`, html`<button type="button" class="danger" data-do="delete">${ui.icon('trash')} Entwurf löschen</button>`);
        }
        return html`
          <div class="page-head">
            <div><a href="#/belege" class="small">${ui.icon('left', 'sm')} Alle Belege</a>
              <h1 style="margin-top:4px">${title}</h1>
              <div class="sub row" style="gap:8px">${ui.badge(stateObj)}${doc.client.name ? html`<span>${doc.client.name}</span>` : ''}${!draft ? html`<span class="muted">· ${ui.icon('lock', 'sm')} festgeschrieben</span>` : ''}</div></div>
            <div class="row">
              ${draft ? html`<button class="btn" data-do="pdf">${ui.icon('download')} PDF-Entwurf</button><button class="btn primary" data-do="finalize">${ui.icon('check')} Festschreiben</button>`
                : html`<button class="btn primary" data-do="pdf">${ui.icon('download')} PDF herunterladen</button>`}
              <div class="menu-wrap"><button class="btn" data-menu-toggle aria-haspopup="menu" aria-expanded="false" aria-label="Weitere Aktionen">${ui.icon('more')}</button><div class="menu hidden" role="menu">${more}</div></div>
            </div>
          </div>`;
      }

      /* ---------- Entwurf: Formular ---------- */
      const cl = doc.client;
      const dueLabel = quote ? 'Gültig bis' : 'Zahlbar bis';
      const contactOptions = st.contacts.slice().sort((a, b) => a.name.localeCompare(b.name, 'de'));
      const knownItems = (() => {
        const m = new Map();
        for (const d of st.documents) for (const it of d.items) if (it.desc.trim() && it.price > 0) { const k = it.desc.split('\n')[0].trim(); if (!m.has(k)) m.set(k, it); }
        return m;
      })();

      function field(path, label, value, o = {}) {
        return html`<label class="f ${o.cls || ''}"><span class="lbl">${label}</span><input data-f="${path}" value="${value == null ? '' : value}" ${o.type ? raw(`type="${o.type}"`) : ''} ${o.ph ? raw(`placeholder="${U.esc(o.ph)}"`) : ''} ${o.list ? raw(`list="${o.list}"`) : ''} ${o.mode ? raw(`inputmode="${o.mode}"`) : ''} autocomplete="off"></label>`;
      }

      function itemHtml(it, i) {
        const c = C.compute(doc);
        return html`<div class="item" data-i="${i}">
          <div class="top"><span class="pos">POSITION ${i + 1}</span><span class="row" style="gap:2px">
            <button type="button" class="btn ghost icon-only sm" data-item-act="up" data-i="${i}" aria-label="Nach oben" ${i === 0 ? raw('disabled') : ''}>${ui.icon('up', 'sm')}</button>
            <button type="button" class="btn ghost icon-only sm" data-item-act="down" data-i="${i}" aria-label="Nach unten" ${i === doc.items.length - 1 ? raw('disabled') : ''}>${ui.icon('downarrow', 'sm')}</button>
            <button type="button" class="btn ghost icon-only sm" data-item-act="dup" data-i="${i}" aria-label="Position duplizieren">${ui.icon('copy', 'sm')}</button>
            <button type="button" class="btn ghost icon-only sm" data-item-act="del" data-i="${i}" aria-label="Position entfernen" ${doc.items.length === 1 ? raw('disabled') : ''}>${ui.icon('trash', 'sm')}</button></span></div>
          <label class="f"><span class="lbl">Beschreibung <span class="hint">erste Zeile = Titel, weitere Zeilen = Details</span></span><textarea data-k="desc" data-i="${i}" rows="2" list="descs" placeholder="z. B. Website-Konzept">${it.desc}</textarea></label>
          <div class="fields">
            <label class="f c3 keep"><span class="lbl">Menge</span><input data-k="qty" data-i="${i}" inputmode="decimal" value="${U.numInput(it.qty)}"></label>
            <label class="f c3 keep"><span class="lbl">Einheit</span><select data-k="unit" data-i="${i}">${C.UNITS.map(u => html`<option value="${u.key}" ${it.unit === u.key ? 'selected' : ''}>${u.label}</option>`)}</select></label>
            <label class="f c3 keep"><span class="lbl">Einzelpreis${doc.klein ? '' : ' netto'}</span><div class="input-suffix"><input data-k="price" data-i="${i}" inputmode="decimal" value="${U.moneyInput(it.price)}"><span>€</span></div></label>
            ${doc.klein ? '' : html`<label class="f c3 keep"><span class="lbl">USt.</span><select data-k="vat" data-i="${i}">${C.VAT_RATES.map(r => html`<option value="${r}" ${Number(it.vat) === r ? 'selected' : ''}>${r} %</option>`)}</select></label>`}
          </div>
          <div class="total" data-total="${i}">${U.eur(c.lines[i].net)}</div></div>`;
      }

      function formHtml() {
        return html`
          <section class="card" aria-labelledby="recT"><div class="card-head"><h2 id="recT">Empfänger</h2></div>
            <div class="fields">
              <label class="f"><span class="lbl">Aus Kontakten übernehmen</span><select id="contactSel"><option value="">– Kontakt wählen oder unten eintippen –</option>${contactOptions.map(c => html`<option value="${c.id}" ${doc.contactId === c.id ? 'selected' : ''}>${c.name}${c.person ? ' · ' + c.person : ''}</option>`)}</select></label>
              ${field('client.name', 'Name / Firma *', cl.name, { cls: 'c8' })}
              <label class="f c4"><span class="lbl">Typ</span><select data-f="client.isBusiness"><option value="1" ${cl.isBusiness ? 'selected' : ''}>Unternehmen</option><option value="0" ${!cl.isBusiness ? 'selected' : ''}>Privatperson</option></select></label>
              ${field('client.person', 'Ansprechpartner', cl.person, { cls: 'c6' })}
              ${field('client.salutation', 'Briefanrede', cl.salutation, { cls: 'c6', list: 'saluts', ph: 'Sehr geehrte Frau …' })}
              ${field('client.street', 'Straße und Hausnummer *', cl.street)}
              ${field('client.zip', 'PLZ *', cl.zip, { cls: 'c3 keep', mode: 'numeric' })}${field('client.city', 'Ort *', cl.city, { cls: 'c6 keep' })}
              <label class="f c3 keep"><span class="lbl">Land</span><select data-f="client.country">${U.COUNTRIES.map(([k, n]) => html`<option value="${k}" ${(cl.country || 'DE') === k ? 'selected' : ''}>${n}</option>`)}</select></label>
              ${field('client.email', 'E-Mail (für E-Rechnung)', cl.email, { cls: 'c6', type: 'email' })}
              ${field('client.vatId', 'USt-IdNr. des Empfängers', cl.vatId, { cls: 'c6' })}
              ${inv ? field('client.buyerRef', 'Käuferreferenz / Leitweg-ID', cl.buyerRef, { ph: 'Bei Behörden: Leitweg-ID, sonst z. B. Bestellnummer' }) : ''}
            </div>
            ${!doc.contactId ? html`<div class="row" style="margin-top:10px"><button type="button" class="btn sm" id="saveContact">${ui.icon('users', 'sm')} Als Kontakt speichern</button></div>` : ''}
            <datalist id="saluts"><option value="Sehr geehrte Damen und Herren"><option value="Sehr geehrter Herr "><option value="Sehr geehrte Frau "></datalist></section>

          <section class="card" aria-labelledby="dataT"><div class="card-head"><h2 id="dataT">${quote ? 'Angebotsdaten' : 'Rechnungsdaten'}</h2><span class="small muted">${C.typeLabel(doc)}-Nr.: <strong class="mono">${nextNumber()}</strong> (wird beim Festschreiben vergeben)</span></div>
            <div class="fields">
              <label class="f c4"><span class="lbl">Datum</span><input type="date" data-f="date" value="${doc.date}"></label>
              ${inv ? html`<label class="f c4"><span class="lbl">Leistungsdatum</span><input type="date" data-f="serviceDate" value="${doc.serviceDate}"></label><label class="f c4"><span class="lbl">… bis (Zeitraum)</span><input type="date" data-f="serviceEnd" value="${doc.serviceEnd}"></label>` : ''}
              <label class="f c6"><span class="lbl">${dueLabel}</span><input type="date" data-f="due" value="${doc.due}"></label>
              <div class="c6"><span class="lbl small muted" style="display:block;margin-bottom:4px">Frist ab Belegdatum</span><div class="chips">${[7, 14, 30].map(n => html`<button type="button" class="chip" data-due="${n}">${n} Tage</button>`)}</div></div>
              ${field('title', 'Betreff (optional)', doc.title, { ph: quote ? 'z. B. Angebot Website-Relaunch' : 'z. B. Website-Relaunch' })}
              ${field('reference', 'Ihr Zeichen / Bestellnummer (optional)', doc.reference)}
              ${inv ? html`<label class="check"><input type="checkbox" data-f="klein" ${doc.klein ? raw('checked') : ''}><span>Kleinunternehmerregelung (§ 19 UStG) – <strong>keine Umsatzsteuer</strong> ausweisen</span></label>` : ''}
            </div></section>

          <section class="card" aria-labelledby="posT"><div class="card-head"><h2 id="posT">Positionen</h2></div>
            <div class="stack sm" id="items">${doc.items.map(itemHtml)}</div>
            <div class="row" style="margin-top:10px"><button type="button" class="btn" id="addItem">${ui.icon('plus', 'sm')} Position hinzufügen</button></div>
            <datalist id="descs">${[...knownItems.keys()].slice(0, 60).map(k => html`<option value="${k}">`)}</datalist>
            <div class="fields" style="margin-top:16px;align-items:end">
              <label class="f c6"><span class="lbl">Rabatt</span><select data-f="discount.mode"><option value="" ${!doc.discount ? 'selected' : ''}>Kein Rabatt</option><option value="percent" ${doc.discount && doc.discount.mode === 'percent' ? 'selected' : ''}>in Prozent</option><option value="amount" ${doc.discount && doc.discount.mode === 'amount' ? 'selected' : ''}>als Betrag</option></select></label>
              <label class="f c6 ${doc.discount ? '' : 'hidden'}" id="discVal"><span class="lbl">Höhe</span><div class="input-suffix"><input data-f="discount.value" inputmode="decimal" value="${doc.discount ? (doc.discount.mode === 'percent' ? U.numInput(doc.discount.value / 100) : U.moneyInput(doc.discount.value)) : ''}"><span id="discUnit">${doc.discount && doc.discount.mode === 'percent' ? '%' : '€'}</span></div></label>
            </div>
            <div id="summary" style="margin-top:14px">${raw(sumHtml())}</div></section>

          <section class="card" aria-labelledby="txtT"><div class="card-head"><h2 id="txtT">Texte</h2></div>
            <div class="stack sm">
              <label class="f"><span class="lbl">Einleitung (nach der Anrede)</span><textarea data-f="intro" rows="2">${doc.intro}</textarea></label>
              <label class="f"><span class="lbl">Schlusstext</span><textarea data-f="closing" rows="3">${doc.closing}</textarea></label>
              <div class="hint">Platzhalter: <span class="kbd">{faellig}</span> <span class="kbd">{gueltig_bis}</span> <span class="kbd">{nummer}</span> <span class="kbd">{datum}</span></div>
              <label class="f"><span class="lbl">Interne Notiz (wird nicht gedruckt)</span><textarea data-f="notes" rows="2">${doc.notes}</textarea></label>
            </div></section>`.toString();
      }

      /* ---------- Festgeschrieben: Detail-Panel ---------- */
      function panelHtml() {
        const c = C.compute(doc);
        const orig = original();
        const q = doc.quoteId ? D.byId(st.documents, doc.quoteId) : null;
        const linkedInv = doc.invoiceId ? D.byId(st.documents, doc.invoiceId) : null;
        const stornoDoc = doc.cancelledById ? D.byId(st.documents, doc.cancelledById) : null;
        const dun = doc.dunnings || [];
        const overdue = stateObj.key === 'overdue';
        const kvRows = [
          ['Status', ui.badge(stateObj)], ['Datum', U.fmtDate(doc.date)],
          inv && !storno ? ['Leistungsdatum', doc.serviceEnd ? `${U.fmtDate(doc.serviceDate)} – ${U.fmtDate(doc.serviceEnd)}` : U.fmtDate(doc.serviceDate || doc.date)] : null,
          !storno ? [quote ? 'Gültig bis' : 'Zahlbar bis', U.fmtDate(doc.due)] : null,
          ['Gesamtbetrag', html`<strong class="num">${U.eur(c.gross)}</strong>`],
          inv && !storno ? ['Bezahlt', html`<span class="num">${U.eur(c.paid)}</span>`] : null,
          inv && !storno && doc.status === 'final' ? ['Noch offen', html`<strong class="num" ${c.open > 0 && overdue ? raw('style="color:var(--red)"') : ''}>${U.eur(Math.max(0, c.open))}</strong>`] : null,
          ['Versendet am', doc.sentAt ? U.fmtDate(doc.sentAt) : html`<span class="muted">noch nicht vermerkt</span> <button type="button" class="btn sm" data-do="sent">Heute versendet</button>`],
        ].filter(Boolean);
        return html`
          <section class="card"><div class="card-head"><h2>Übersicht</h2></div><dl class="kv">${kvRows.map(r => html`<dt>${r[0]}</dt><dd>${r[1]}</dd>`)}</dl>
            <div class="row" style="margin-top:12px">${quote && doc.status !== 'draft' ? html`
              ${doc.status !== 'accepted' ? html`<button class="btn" data-do="q-accept">${ui.icon('check', 'sm')} Angenommen</button>` : ''}
              ${doc.status !== 'declined' ? html`<button class="btn" data-do="q-decline">${ui.icon('x', 'sm')} Abgelehnt</button>` : ''}
              ${doc.status !== 'final' ? html`<button class="btn" data-do="q-open">Wieder offen</button>` : ''}
              ${!linkedInv ? html`<button class="btn primary" data-do="q2i">${ui.icon('arrow', 'sm')} In Rechnung umwandeln</button>` : ''}` : ''}</div></section>

          ${inv && !storno && doc.status === 'final' ? html`<section class="card"><div class="card-head"><h2>Zahlungen</h2>${c.open > 0 ? html`<button class="btn sm" data-do="markpaid">${ui.icon('check', 'sm')} Vollständig bezahlt</button>` : ''}</div>
            ${doc.payments.length ? html`<div class="list">${doc.payments.map(p => html`<div class="row between"><span><strong class="num">${U.eur(p.amount)}</strong> <span class="muted small">am ${U.fmtDate(p.date)}${p.note ? ' · ' + p.note : ''}</span></span><button class="btn ghost icon-only sm" data-pay-del="${p.id}" aria-label="Zahlung löschen">${ui.icon('trash', 'sm')}</button></div>`)}</div>` : html`<div class="hint">Noch keine Zahlung erfasst.</div>`}
            ${c.open > 0 ? html`<div class="fields" style="margin-top:12px;align-items:end"><label class="f c4"><span class="lbl">Datum</span><input type="date" id="payDate" value="${today}"></label><label class="f c4"><span class="lbl">Betrag</span><div class="input-suffix"><input id="payAmt" inputmode="decimal" value="${U.moneyInput(c.open)}"><span>€</span></div></label><div class="c4"><button class="btn" style="width:100%" id="payAdd">Zahlung erfassen</button></div></div>` : ''}</section>` : ''}

          ${inv && !storno && doc.status === 'final' && (overdue || dun.length) ? html`<section class="card"><div class="card-head"><h2>Mahnwesen</h2>${c.open > 0 ? html`<button class="btn sm" data-do="dun">${ui.icon('send', 'sm')} Mahnung erstellen</button>` : ''}</div>
            ${dun.length ? html`<div class="list">${dun.map(m => html`<div class="row between"><span><strong>${C.DUNNING_LEVELS[m.level].label}</strong> <span class="muted small">vom ${U.fmtDate(m.date)}</span></span><span class="num small">${U.eur(m.total)}</span></div>`)}</div>` : html`<div class="hint">Die Rechnung ist überfällig. Erstellen Sie eine freundliche Zahlungserinnerung – bei Bedarf folgen 1. und 2. Mahnung.</div>`}</section>` : ''}

          ${(orig || q || linkedInv || stornoDoc) ? html`<section class="card"><div class="card-head"><h2>Verknüpfungen</h2></div><div class="stack sm">
            ${orig ? html`<a href="#/beleg/${orig.id}">${ui.icon('link', 'sm')} Storno zu Rechnung ${orig.number}</a>` : ''}
            ${q ? html`<a href="#/beleg/${q.id}">${ui.icon('link', 'sm')} Aus Angebot ${q.number}</a>` : ''}
            ${linkedInv ? html`<a href="#/beleg/${linkedInv.id}">${ui.icon('link', 'sm')} Rechnung ${linkedInv.number || '(Entwurf)'}</a>` : ''}
            ${stornoDoc ? html`<a href="#/beleg/${stornoDoc.id}">${ui.icon('link', 'sm')} Storniert durch ${stornoDoc.number}</a>` : ''}</div></section>` : ''}

          <section class="card"><div class="card-head"><h2>Empfänger</h2></div><div class="small">${[doc.client.name, doc.client.person, doc.client.street, [doc.client.zip, doc.client.city].filter(Boolean).join(' '), doc.client.email].filter(Boolean).map(l => html`${l}<br>`)}</div></section>
          <section class="card"><label class="f"><span class="lbl">Interne Notiz (nicht gedruckt)</span><textarea data-f="notes" rows="2">${doc.notes}</textarea></label></section>`.toString();
      }

      /* ---------- Aufbau ---------- */
      el.innerHTML = html`${raw(headerHtml().toString())}
        <div class="mobile-tabs"><div class="seg" role="group" aria-label="Ansicht"><button data-pane="form" aria-pressed="true">${draft ? 'Bearbeiten' : 'Details'}</button><button data-pane="preview" aria-pressed="false">Vorschau</button></div></div>
        <div class="editor" id="editor" data-pane="form"><div class="form">${raw(draft ? formHtml() : panelHtml())}</div><div class="preview" id="preview" aria-label="Vorschau"></div></div>`.toString();
      renderPreview();
      el.querySelectorAll('textarea').forEach(t => { ui.autosize(t); });

      /* ---------- Ereignisse: Formular ---------- */
      const setPath = (path, value) => {
        const parts = path.split('.'); let o = doc;
        for (let i = 0; i < parts.length - 1; i++) { if (o[parts[i]] == null) o[parts[i]] = {}; o = o[parts[i]]; }
        o[parts[parts.length - 1]] = value;
      };

      el.addEventListener('input', ev => {
        const t = ev.target;
        if (t.matches('textarea')) ui.autosize(t);
        if (!draft) { if (t.matches('[data-f="notes"]')) { doc.notes = t.value; dirty = true; clearTimeout(persistTimer); persistTimer = setTimeout(() => { dirty = false; D.updateDocument(store, doc.id, { notes: doc.notes }); }, 450); } return; }
        if (t.dataset.k) return onItemInput(t, false);
        const path = t.dataset.f; if (!path) return;
        if (path === 'client.isBusiness') { cl.isBusiness = t.value === '1'; return touch(); }
        if (path === 'klein') return;
        if (path === 'discount.mode' || path === 'discount.value') return onDiscount(t);
        setPath(path, t.type === 'checkbox' ? t.checked : t.value);
        if (path === 'date' && doc.due && doc.due < doc.date) { doc.due = U.addDays(doc.date, quote ? set.defaults.quoteValidDays : set.defaults.paymentDays); el.querySelector('[data-f="due"]').value = doc.due; }
        touch();
        if (path === 'client.name') { const hasName = !!doc.client.name.trim(); const b = el.querySelector('#saveContact'); if (b) b.disabled = !hasName; }
      });

      el.addEventListener('change', ev => {
        const t = ev.target;
        if (!draft) return;
        if (t.dataset.k) return onItemInput(t, true);
        if (t.dataset.f === 'klein') {
          doc.klein = t.checked;
          doc.items.forEach(it => { it.vat = doc.klein ? 0 : (it.vat || 19); });
          renderItems(); touch(); return;
        }
        if (t.dataset.f === 'discount.mode') { onDiscount(t); return; }
        if (t.id === 'contactSel') {
          const c = D.byId(st.contacts, t.value);
          if (!c) { doc.contactId = null; touch(); return; }
          doc.contactId = c.id; doc.client = Object.assign(doc.client, D.contactClient(c));
          dirty = true; persistNow(); ctx.rerender(); // Formular mit übernommenen Daten neu aufbauen
        }
      });

      function onDiscount(t) {
        if (t.dataset.f === 'discount.mode') {
          if (!t.value) doc.discount = null; else doc.discount = { mode: t.value, value: doc.discount ? doc.discount.value : 0 };
          el.querySelector('#discVal').classList.toggle('hidden', !doc.discount);
          el.querySelector('#discUnit').textContent = t.value === 'percent' ? '%' : '€';
          const inp = el.querySelector('[data-f="discount.value"]'); inp.value = '';
          if (doc.discount) doc.discount.value = 0;
        } else {
          const v = doc.discount.mode === 'percent' ? U.parsePercentBp(t.value) : U.parseMoney(t.value);
          t.setAttribute('aria-invalid', String(t.value.trim() !== '' && (v == null || v < 0)));
          doc.discount.value = v != null && v >= 0 ? v : 0;
        }
        touch();
      }

      function onItemInput(t, committed) {
        const i = +t.dataset.i, k = t.dataset.k, it = doc.items[i];
        if (!it) return;
        if (k === 'desc') {
          it.desc = t.value;
          if (committed) { // bekannte Leistung gewählt: Einheit/Preis vorbelegen
            const known = knownItems.get(t.value.split('\n')[0].trim());
            if (known && (!it.price) && t.value.trim() === known.desc.split('\n')[0].trim()) { it.price = known.price; it.unit = known.unit; if (!doc.klein) it.vat = known.vat || 19; renderItems(); }
          }
        } else if (k === 'qty') {
          const v = U.parseNum(t.value); t.setAttribute('aria-invalid', String(t.value.trim() !== '' && v == null)); it.qty = v == null ? 0 : v;
          if (committed) t.value = U.numInput(it.qty);
        } else if (k === 'price') {
          const v = U.parseMoney(t.value); t.setAttribute('aria-invalid', String(t.value.trim() !== '' && v == null)); it.price = v == null ? 0 : v;
          if (committed) t.value = U.moneyInput(it.price);
        } else if (k === 'unit') it.unit = t.value;
        else if (k === 'vat') it.vat = Number(t.value);
        touch();
      }

      function renderItems() {
        const box = el.querySelector('#items'); if (!box) return;
        box.innerHTML = doc.items.map(itemHtml).join('');
        box.querySelectorAll('textarea').forEach(ui.autosize);
      }
      const itemAct = (act, i) => {
        if (act === 'del' && doc.items.length > 1) doc.items.splice(i, 1);
        else if (act === 'dup') doc.items.splice(i + 1, 0, Object.assign({}, doc.items[i], { id: U.uid('i') }));
        else if (act === 'up' && i > 0) [doc.items[i - 1], doc.items[i]] = [doc.items[i], doc.items[i - 1]];
        else if (act === 'down' && i < doc.items.length - 1) [doc.items[i + 1], doc.items[i]] = [doc.items[i], doc.items[i + 1]];
        renderItems(); touch();
      };

      /* ---------- Aktionen ---------- */
      const note = (msg, o) => ui.toast(msg, o);
      async function finalizeFlow() {
        persistNow();
        const v = D.validateForFinalize(store, doc);
        if (v.errors.length) {
          const needsSettings = v.errors.some(e => /Einstellungen/.test(e));
          await ui.dialog({
            title: 'Noch nicht vollständig',
            body: html`<p style="margin:0">Damit der Beleg festgeschrieben werden kann, fehlt noch:</p><div class="callout bad"><ul>${v.errors.map(e => html`<li>${e}</li>`)}</ul></div>`.toString(),
            actions: [{ label: 'Zurück zum Beleg', value: 'cancel' }, ...(needsSettings ? [{ label: 'Zu den Einstellungen', value: 'settings', kind: 'primary' }] : [])],
          }).then(r => { if (r.value === 'settings') ctx.navigate('#/einstellungen/unternehmen'); });
          return;
        }
        const number = nextNumber();
        const r = await ui.dialog({
          title: `${C.typeLabel(doc)} festschreiben?`,
          body: html`<p style="margin:0">Der Beleg erhält die Nummer <strong class="mono">${number}</strong> und kann danach <strong>nicht mehr verändert</strong> werden. ${inv ? 'Korrekturen sind dann nur über eine Stornorechnung möglich – so verlangt es die ordnungsgemäße Buchführung.' : 'Sie können ihn jederzeit duplizieren.'}</p>
            ${v.warnings.length ? html`<div class="callout"><strong>Hinweise</strong><ul>${v.warnings.map(w => html`<li>${w}</li>`)}</ul></div>` : ''}`.toString(),
          actions: [{ label: 'Abbrechen', value: 'cancel' }, { label: 'Festschreiben', value: 'ok', kind: 'primary', icon: 'check' }],
        });
        if (r.value !== 'ok') return;
        try { D.finalizeDocument(store, doc.id); } catch (e) { note(e.message, { type: 'bad' }); return; }
        ctx.rerender();
        note(`${C.docTitle(doc)} festgeschrieben.`, { actionLabel: 'PDF herunterladen', onAction: downloadPdf });
      }

      async function eInvoiceFlow(profile) {
        const prof = EI.PROFILES[profile];
        const o = original();
        const status = () => {
          const probe = Object.assign({}, doc, { einvoice: { email: probeEmail, buyerRef: probeRef } });
          return EI.check(probe, set, profile, o);
        };
        let probeEmail = doc.einvoice.email || doc.client.email, probeRef = doc.einvoice.buyerRef || doc.client.buyerRef;
        const info = profile === 'xrechnung'
          ? 'XRechnung ist das Standardformat für Rechnungen an Behörden und wird von den meisten Buchhaltungsprogrammen gelesen. Die XML-Datei enthält alle Rechnungsdaten maschinenlesbar.'
          : 'ZUGFeRD verbindet die lesbare PDF-Rechnung mit den maschinenlesbaren Daten in einer Datei – ideal für Geschäftskunden, die E-Rechnungen verarbeiten. Hinweis: Das PDF ist nicht als PDF/A-3 zertifiziert.';
        const body = () => {
          const s = status();
          return html`<p class="muted" style="margin:0">${info}</p>
            <div class="fields"><label class="f c6"><span class="lbl">E-Mail des Empfängers${profile === 'xrechnung' ? ' *' : ''}</span><input name="email" type="email" value="${probeEmail}"></label>
            <label class="f c6"><span class="lbl">Käuferreferenz / Leitweg-ID</span><input name="ref" value="${probeRef}" placeholder="optional"></label></div>
            <div id="chk">${checkHtml(s)}</div>`.toString();
        };
        const checkHtml = s => s.errors.length
          ? html`<div class="callout bad"><strong>Noch nicht möglich:</strong><ul>${s.errors.map(e => html`<li>${e}</li>`)}</ul></div>`
          : html`<div class="callout good"><strong>Alle Pflichtangaben sind vorhanden.</strong>${s.warnings.length ? html`<ul>${s.warnings.map(w => html`<li>${w}</li>`)}</ul>` : ''}</div>`;
        const r = await ui.dialog({
          title: profile === 'xrechnung' ? 'E-Rechnung (XRechnung)' : 'PDF mit E-Rechnung (ZUGFeRD)', body: body(), size: 'wide',
          actions: [{ label: 'Abbrechen', value: 'cancel' }, { label: profile === 'xrechnung' ? 'XML herunterladen' : 'PDF herunterladen', value: 'ok', kind: 'primary', icon: 'download' }],
          onOpen(dlg) {
            const upd = () => { probeEmail = dlg.querySelector('[name=email]').value.trim(); probeRef = dlg.querySelector('[name=ref]').value.trim(); dlg.querySelector('#chk').innerHTML = checkHtml(status()).toString(); };
            dlg.querySelectorAll('input').forEach(i => i.addEventListener('input', upd));
          },
          beforeClose(value) { if (value === 'ok' && status().errors.length) return 'Bitte zuerst die genannten Punkte beheben.'; return false; },
        });
        if (r.value !== 'ok') return;
        D.updateDocument(store, doc.id, { einvoice: { email: probeEmail, buyerRef: probeRef } });
        const xml = EI.build(doc, set, { profile, original: o });
        if (profile === 'xrechnung') ui.download(`${doc.number}_xrechnung.xml`, xml, 'application/xml');
        else ui.download(`${fileBase()}_ZUGFeRD.pdf`, pdfBlob(pdfBytes({ xml })));
        note(profile === 'xrechnung' ? 'XRechnung heruntergeladen.' : 'PDF mit eingebetteter E-Rechnung heruntergeladen.');
      }

      async function dunningFlow() {
        const dn = doc.dunnings || [];
        let level = D.nextDunningLevel(doc), date = today;
        const calcHtml = () => {
          const d = C.calcDunning(doc, set, level, date);
          const row = (l, v) => v ? html`<div class="row between"><span>${l}</span><span class="num">${U.eur(v)}</span></div>` : '';
          return html`<div class="card flat stack sm">${row('Offener Rechnungsbetrag', d.open)}${row('Mahngebühr', d.fee)}${row('Verzugspauschale (§ 288 Abs. 5 BGB, nur B2B)', d.lumpSum)}${row(d.interestRate != null ? `Verzugszinsen ${U.fmtNum(d.interestRate)} % p. a. für ${d.days} Tage` : '', d.interest)}
            <div class="row between" style="border-top:1px solid var(--line);padding-top:8px"><strong>Gesamtbetrag</strong><strong class="num">${U.eur(d.total)}</strong></div></div>
            ${level >= 1 && d.interestRate == null ? html`<div class="hint">Verzugszinsen werden nur berechnet, wenn Sie in den Einstellungen unter „Mahnwesen“ den aktuellen Basiszinssatz hinterlegen.</div>` : ''}`.toString();
        };
        const r = await ui.dialog({
          title: 'Mahnung erstellen',
          body: html`<div class="fields"><label class="f c6"><span class="lbl">Stufe</span><select name="level">${C.DUNNING_LEVELS.map(l => html`<option value="${l.level}" ${l.level === level ? 'selected' : ''}>${l.label}</option>`)}</select></label>
            <label class="f c6"><span class="lbl">Datum des Schreibens</span><input type="date" name="date" value="${date}"></label></div><div id="calc">${raw(calcHtml())}</div>
            <div class="hint">Das PDF wird heruntergeladen und die Mahnung am Beleg vermerkt. Prüfen Sie Inhalt und Fristen vor dem Versand.</div>`.toString(),
          actions: [{ label: 'Abbrechen', value: 'cancel' }, { label: 'PDF erstellen', value: 'ok', kind: 'primary', icon: 'download' }],
          onOpen(dlg) {
            const upd = () => { level = +dlg.querySelector('[name=level]').value; date = dlg.querySelector('[name=date]').value || today; dlg.querySelector('#calc').innerHTML = calcHtml(); };
            dlg.querySelectorAll('select,input').forEach(i => i.addEventListener('input', upd));
          },
        });
        if (r.value !== 'ok') return;
        const d = C.calcDunning(doc, set, level, date);
        const layout = L.layoutDunning(doc, set, level, date);
        ui.download(`${C.DUNNING_LEVELS[level].label.replace(/[. ]+/g, '_')}_${doc.number}_${slug(doc.client.name)}.pdf`, pdfBlob(KK.docpdf.toPdf(layout, { author: set.company.name })));
        D.addDunning(store, doc.id, { level, date, fee: d.fee, interest: d.interest, lumpSum: d.lumpSum, total: d.total });
        ctx.rerender();
        note(`${C.DUNNING_LEVELS[level].label} erstellt und vermerkt.`);
      }

      async function act(name) {
        try {
          if (name === 'pdf') return downloadPdf();
          if (name === 'openpdf') return openPdf();
          if (name === 'finalize') return await finalizeFlow();
          if (name === 'xrechnung' || name === 'zugferd') return await eInvoiceFlow(name);
          if (name === 'dun') return await dunningFlow();
          if (name === 'duplicate') { persistNow(); const d = D.duplicateDocument(store, doc.id); ctx.navigate('#/beleg/' + d.id); return note('Kopie als Entwurf angelegt.'); }
          if (name === 'delete') {
            if (!await ui.confirm({ title: 'Entwurf löschen?', text: 'Der Entwurf wird endgültig gelöscht.', ok: 'Löschen', danger: true })) return;
            dirty = false; D.deleteDocument(store, doc.id); ctx.navigate('#/belege'); return note('Entwurf gelöscht.');
          }
          if (name === 'cancel') {
            const r = await ui.dialog({
              title: 'Rechnung stornieren?',
              body: html`<p style="margin:0">Zu <strong>${doc.number}</strong> wird eine <strong>Stornorechnung</strong> mit eigener Nummer erstellt und die Rechnung als storniert markiert. Beide Belege bleiben aufbewahrt.</p>${C.compute(doc).paid > 0 ? html`<div class="callout"><strong>Achtung:</strong> Zu dieser Rechnung wurden bereits ${U.eur(C.compute(doc).paid)} gezahlt. Die Erstattung müssen Sie selbst veranlassen.</div>` : ''}`.toString(),
              actions: [{ label: 'Abbrechen', value: 'cancel' }, { label: 'Stornorechnung erstellen', value: 'ok', kind: 'danger' }],
            });
            if (r.value !== 'ok') return;
            const s = D.cancelInvoice(store, doc.id); ctx.navigate('#/beleg/' + s.id); return note(`Stornorechnung ${s.number} erstellt.`);
          }
          if (name === 'q2i') { const d = D.quoteToInvoice(store, doc.id); ctx.navigate('#/beleg/' + d.id); return note('Rechnungsentwurf aus dem Angebot erstellt.'); }
          if (name === 'q-accept') { D.setQuoteStatus(store, doc.id, 'accepted'); return ctx.rerender(); }
          if (name === 'q-decline') { D.setQuoteStatus(store, doc.id, 'declined'); return ctx.rerender(); }
          if (name === 'q-open') { D.setQuoteStatus(store, doc.id, 'final'); return ctx.rerender(); }
          if (name === 'sent') { D.markSent(store, doc.id); return ctx.rerender(); }
          if (name === 'markpaid') { D.markPaid(store, doc.id); ctx.rerender(); return note('Als bezahlt markiert.'); }
        } catch (e) { console.error(e); note(e.message, { type: 'bad' }); }
      }

      el.addEventListener('click', ev => {
        const d = ev.target.closest('[data-do]'); if (d) return act(d.dataset.do);
        const ia = ev.target.closest('[data-item-act]'); if (ia) return itemAct(ia.dataset.itemAct, +ia.dataset.i);
        if (ev.target.closest('#addItem')) { doc.items.push(D.blankItem(store)); if (doc.klein) doc.items.at(-1).vat = 0; renderItems(); touch(); const ta = el.querySelectorAll('#items textarea'); ta[ta.length - 1].focus(); return; }
        const due = ev.target.closest('[data-due]');
        if (due) { doc.due = U.addDays(doc.date, +due.dataset.due); el.querySelector('[data-f="due"]').value = doc.due; return touch(); }
        const pane = ev.target.closest('[data-pane]');
        if (pane && pane.tagName === 'BUTTON') { el.querySelector('#editor').dataset.pane = pane.dataset.pane; el.querySelectorAll('.mobile-tabs button').forEach(b => b.setAttribute('aria-pressed', String(b === pane))); if (pane.dataset.pane === 'preview') renderPreview(); return; }
        if (ev.target.closest('#saveContact')) {
          if (!doc.client.name.trim()) return note('Bitte zuerst einen Namen eintragen.', { type: 'bad' });
          const c = D.createContact(store, Object.assign({ status: 'Kunde' }, doc.client));
          doc.contactId = c.id; dirty = true; persistNow(); ctx.rerender(); return note('Kontakt gespeichert.');
        }
        const pd = ev.target.closest('[data-pay-del]');
        if (pd) { D.removePayment(store, doc.id, pd.dataset.payDel); return ctx.rerender(); }
        if (ev.target.closest('#payAdd')) {
          const amount = U.parseMoney(el.querySelector('#payAmt').value);
          try { D.addPayment(store, doc.id, { date: el.querySelector('#payDate').value, amount }); ctx.rerender(); note('Zahlung erfasst.'); } catch (e) { note(e.message, { type: 'bad' }); }
        }
      });

      return () => { persistNow(); KK.flush = null; clearTimeout(previewTimer); };
    },
  };
})(typeof self !== 'undefined' ? self : globalThis);
