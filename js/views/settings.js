/* Klarkontor – Ansicht „Einstellungen“ */
(function (root) {
  'use strict';
  const KK = root.KK, U = KK.util, C = KK.calc, D = KK.domain, S = KK.store, ui = KK.ui;
  const { html, raw } = U;
  KK.views = KK.views || {};

  const TABS = [['unternehmen', 'Unternehmen'], ['steuer', 'Steuer & Nummern'], ['texte', 'Texte'], ['mahnwesen', 'Mahnwesen'], ['daten', 'Daten & Sicherung']];

  // Bild (PNG/JPG/SVG/…) -> weißer Hintergrund, max. 800×300 px, JPEG-Daten-URL
  function processLogo(file) {
    return new Promise((resolve, reject) => {
      if (file.size > 8 * 1024 * 1024) return reject(new Error('Die Datei ist zu groß (max. 8 MB).'));
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        try {
          let w = img.naturalWidth || 400, h = img.naturalHeight || 200;
          if (!w || !h) throw new Error('Bild konnte nicht gelesen werden.');
          const k = Math.min(1, 800 / w, 300 / h);
          w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(img, 0, 0, w, h);
          resolve({ dataUrl: cv.toDataURL('image/jpeg', 0.9), w, h });
        } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Das Bild konnte nicht geladen werden. Bitte PNG, JPG oder SVG verwenden.')); };
      img.src = url;
    });
  }

  const setPath = (obj, path, v) => { const p = path.split('.'); let o = obj; for (let i = 0; i < p.length - 1; i++) o = o[p[i]]; o[p[p.length - 1]] = v; };

  function f(path, label, val, o = {}) {
    return html`<label class="f ${o.cls || ''}"><span class="lbl">${label}</span><input data-s="${path}" ${o.cast ? raw(`data-cast="${o.cast}"`) : ''} value="${val == null ? '' : val}" ${o.type ? raw(`type="${o.type}"`) : ''} ${o.ph ? raw(`placeholder="${U.esc(o.ph)}"`) : ''} ${o.mode ? raw(`inputmode="${o.mode}"`) : ''} autocomplete="${o.ac || 'off'}">${o.hint ? html`<span class="hint">${o.hint}</span>` : ''}</label>`;
  }

  function tabCompany(st) {
    const co = st.settings.company;
    const missing = [];
    if (!co.name.trim()) missing.push('Firmenname');
    if (!co.street.trim() || !co.zip.trim() || !co.city.trim()) missing.push('vollständige Anschrift');
    if (!co.taxNo.trim() && !co.vatId.trim()) missing.push('Steuernummer oder USt-IdNr.');
    if (!U.ibanValid(co.iban)) missing.push('gültige IBAN');
    if (!U.emailValid(co.email)) missing.push('E-Mail');
    if (!co.phone.trim()) missing.push('Telefon');
    return html`
      <div id="complete">${missing.length ? html`<div class="callout"><strong>Für Rechnungen und E-Rechnungen fehlt noch:</strong> ${missing.join(', ')}.</div>` : html`<div class="callout good">${ui.icon('check', 'sm')} <strong>Alle Pflichtangaben für Rechnungen und E-Rechnungen sind vorhanden.</strong></div>`}</div>
      <section class="card"><div class="card-head"><h2>Unternehmen</h2></div>
        <div class="fields">
          ${f('settings.company.name', 'Firmenname *', co.name, { cls: 'c6', ph: 'z. B. Muster Webdesign', ac: 'organization' })}
          ${f('settings.company.owner', 'Inhaber/in bzw. Ansprechperson', co.owner, { cls: 'c6', ph: 'Vor- und Nachname', ac: 'name', hint: 'Steht unter der Grußformel.' })}
          ${f('settings.company.street', 'Straße und Hausnummer *', co.street, { ac: 'street-address' })}
          ${f('settings.company.zip', 'PLZ *', co.zip, { cls: 'c3 keep', mode: 'numeric', ac: 'postal-code' })}${f('settings.company.city', 'Ort *', co.city, { cls: 'c6 keep', ac: 'address-level2' })}
          <label class="f c3 keep"><span class="lbl">Land</span><select data-s="settings.company.country">${U.COUNTRIES.map(([k, n]) => html`<option value="${k}" ${co.country === k ? 'selected' : ''}>${n}</option>`)}</select></label>
          ${f('settings.company.email', 'E-Mail *', co.email, { cls: 'c6', type: 'email', ac: 'email' })}${f('settings.company.phone', 'Telefon *', co.phone, { cls: 'c6', type: 'tel', ac: 'tel' })}
          ${f('settings.company.website', 'Website', co.website, { ph: 'www.beispiel.de' })}
        </div></section>
      <section class="card"><div class="card-head"><h2>Steuer & Bank</h2></div>
        <div class="fields">
          ${f('settings.company.taxNo', 'Steuernummer', co.taxNo, { cls: 'c6', ph: '12/345/67890', hint: 'Vom Finanzamt. Steuernummer oder USt-IdNr. ist Pflicht.' })}${f('settings.company.vatId', 'USt-IdNr.', co.vatId, { cls: 'c6', ph: 'DE123456789', hint: 'Nur falls vorhanden.' })}
          ${f('settings.company.bankName', 'Bank', co.bankName, { cls: 'c4' })}
          <label class="f c5"><span class="lbl">IBAN</span><input data-s="settings.company.iban" id="iban" value="${U.ibanFmt(co.iban)}" placeholder="DE00 0000 0000 0000 0000 00" autocomplete="off"><span class="hint" id="ibanHint">${co.iban ? (U.ibanValid(co.iban) ? '✓ gültige IBAN' : 'Die IBAN scheint ungültig zu sein.') : 'Für Zahlungsangaben und den GiroCode.'}</span></label>
          ${f('settings.company.bic', 'BIC', co.bic, { cls: 'c3', ph: 'optional' })}
        </div></section>
      <section class="card"><div class="card-head"><h2>Logo</h2></div>
        <div class="row top"><div>${co.logo ? html`<img class="logo-preview" src="${co.logo}" alt="Ihr Logo">` : html`<div class="logo-preview muted small" style="display:grid;place-items:center;width:240px;height:80px">Kein Logo</div>`}</div>
          <div class="stack sm" style="flex:1;min-width:220px"><div class="row"><label class="btn" for="logoFile">${ui.icon('upload', 'sm')} Logo hochladen</label><input type="file" id="logoFile" accept="image/*" class="sr-only">${co.logo ? html`<button class="btn" id="logoDel">Entfernen</button>` : ''}</div>
            <div class="hint">PNG, JPG oder SVG. Das Logo wird verkleinert und nur in diesem Browser gespeichert; transparente Bereiche werden weiß.</div></div></div></section>`;
  }

  function tabTax(st) {
    const set = st.settings, year = new Date().getFullYear();
    const num = t => { const seq = set.numbering[t]; const key = C.counterKey(seq.pattern, year); return (seq.counters[key] || 0) + 1; };
    const prev = t => C.formatNumber(set.numbering[t].pattern, num(t), year);
    return html`
      <section class="card"><div class="card-head"><h2>Umsatzsteuer</h2></div>
        <div class="stack sm">
          <label class="check"><input type="radio" name="vat" value="klein" ${set.tax.kleinunternehmer ? raw('checked') : ''}><span><strong>Kleinunternehmerregelung (§ 19 UStG)</strong><br><span class="hint">Keine Umsatzsteuer auf Rechnungen. Möglich bei bis zu 25.000 € Vorjahresumsatz und voraussichtlich max. 100.000 € im laufenden Jahr.</span></span></label>
          <label class="check"><input type="radio" name="vat" value="regel" ${!set.tax.kleinunternehmer ? raw('checked') : ''}><span><strong>Regelbesteuerung</strong><br><span class="hint">Umsatzsteuer wird je Position mit 19 % oder 7 % ausgewiesen.</span></span></label>
          <div class="callout info small">Die Einstellung gilt für <strong>neue</strong> Belege. Bereits angelegte Belege behalten ihre Steuerbehandlung. Nicht unterstützt: Reverse-Charge, innergemeinschaftliche Lieferungen und Leistungen an Empfänger im Ausland.</div>
        </div></section>
      <section class="card"><div class="card-head"><h2>Nummernkreise</h2></div>
        <div class="stack">
          ${['invoice', 'quote'].map(t => html`<div class="fields" style="align-items:end"><label class="f c6"><span class="lbl">${t === 'invoice' ? 'Rechnungsnummern' : 'Angebotsnummern'} – Muster</span><input data-s="settings.numbering.${t}.pattern" data-cast="pattern" id="pat-${t}" value="${set.numbering[t].pattern}"></label>
            <label class="f c3"><span class="lbl">Nächste Nummer (${year})</span><input data-counter="${t}" inputmode="numeric" value="${num(t)}"></label>
            <div class="c3 small"><span class="muted">Vorschau</span><br><strong class="mono" id="prev-${t}">${prev(t)}</strong></div></div>`)}
          <div class="hint">Platzhalter: <span class="kbd">{YYYY}</span> Jahr (vierstellig), <span class="kbd">{YY}</span> zweistellig, <span class="kbd">{NNN}</span> laufende Nummer (Anzahl N = Stellen). Mit Jahresplatzhalter beginnt die Zählung jedes Jahr neu. Nummern werden erst beim Festschreiben vergeben und lückenlos fortgeführt. Ändern Sie das Muster nur, bevor Sie Belege ausgestellt haben.</div>
        </div></section>
      <section class="card"><div class="card-head"><h2>Fristen</h2></div>
        <div class="fields">${f('settings.defaults.paymentDays', 'Zahlungsziel Rechnungen (Tage)', set.defaults.paymentDays, { cls: 'c6 keep', cast: 'int', mode: 'numeric' })}${f('settings.defaults.quoteValidDays', 'Angebot gültig (Tage)', set.defaults.quoteValidDays, { cls: 'c6 keep', cast: 'int', mode: 'numeric' })}</div></section>`;
  }

  function tabTexts(st) {
    const d = st.settings.defaults;
    const ta = (path, label, v, rows = 3) => html`<label class="f"><span class="lbl">${label}</span><textarea data-s="${path}" rows="${rows}">${v}</textarea></label>`;
    return html`<section class="card"><div class="card-head"><h2>Standardtexte</h2><button class="btn sm" id="resetTexts">Auf Vorschlag zurücksetzen</button></div>
      <div class="stack"><div class="hint">Diese Texte werden bei neuen Belegen vorbelegt und lassen sich dort einzeln anpassen. Platzhalter: <span class="kbd">{faellig}</span> <span class="kbd">{gueltig_bis}</span> <span class="kbd">{nummer}</span> <span class="kbd">{datum}</span>. Die Texte folgen der Anrede („Sehr geehrte …,“) – beginnen Sie klein.</div>
        ${ta('settings.defaults.quoteIntro', 'Angebot – Einleitung', d.quoteIntro, 2)}${ta('settings.defaults.quoteClosing', 'Angebot – Schlusstext', d.quoteClosing)}
        ${ta('settings.defaults.invoiceIntro', 'Rechnung – Einleitung', d.invoiceIntro, 2)}${ta('settings.defaults.invoiceClosing', 'Rechnung – Schlusstext', d.invoiceClosing)}</div></section>`;
  }

  function tabDunning(st) {
    const dn = st.settings.dunning;
    return html`<section class="card"><div class="card-head"><h2>Mahnwesen</h2></div>
      <div class="stack"><div class="callout info small">Bei Zahlungsverzug dürfen Verzugszinsen (Basiszinssatz + 5 Prozentpunkte bei Verbrauchern, + 9 bei Unternehmen) und bei Unternehmen eine Pauschale von 40 € verlangt werden (§ 288 BGB). Den Basiszinssatz veröffentlicht die Bundesbank halbjährlich – bitte aktuell eintragen. Ohne Wert werden keine Zinsen berechnet. Diese Angaben sind keine Rechtsberatung.</div>
        <div class="fields">${f('settings.dunning.baseRate', 'Basiszinssatz (% p. a.)', dn.baseRate == null ? '' : String(dn.baseRate).replace('.', ','), { cls: 'c6', cast: 'pct', mode: 'decimal', ph: 'leer = keine Zinsen', hint: 'Aktuellen Wert bei der Bundesbank nachsehen.' })}</div>
        <label class="check"><input type="checkbox" data-s="settings.dunning.lumpSum" ${dn.lumpSum !== false ? raw('checked') : ''}><span>Verzugspauschale von 40 € bei Rechnungen an Unternehmen berechnen (ab der 1. Mahnung)</span></label>
        <div class="fields">${[['feeReminder', 'Gebühr Zahlungserinnerung'], ['feeDun1', 'Gebühr 1. Mahnung'], ['feeDun2', 'Gebühr 2. Mahnung']].map(([k, l]) => html`<label class="f c4"><span class="lbl">${l}</span><div class="input-suffix"><input data-s="settings.dunning.${k}" data-cast="cents" inputmode="decimal" value="${dn[k] ? U.moneyInput(dn[k]) : ''}" placeholder="0,00"><span>€</span></div></label>`)}</div></div></section>`;
  }

  function tabData(st) {
    const m = st.meta;
    const size = Math.round(JSON.stringify(st).length / 1024);
    return html`
      <section class="card"><div class="card-head"><h2>Sicherung</h2></div>
        <div class="stack sm"><p class="muted" style="margin:0">Ihre Daten liegen ausschließlich in diesem Browser – nicht bei uns und nicht in der Cloud. Das ist gut für den Datenschutz, bedeutet aber: <strong>Wenn Sie Browserdaten löschen oder das Gerät wechseln, sind sie weg</strong>, solange keine Sicherung existiert.</p>
          <div class="row"><button class="btn primary" id="backup">${ui.icon('download')} Sicherung herunterladen</button><label class="btn" for="restoreFile">${ui.icon('upload')} Sicherung einspielen</label><input type="file" id="restoreFile" accept=".json,application/json" class="sr-only"></div>
          <div class="hint">${m.lastBackupAt ? `Letzte Sicherung: ${U.fmtDate(m.lastBackupAt)}` : 'Noch keine Sicherung erstellt'} · ${m.changesSinceBackup} Änderungen seitdem · Datenumfang ca. ${size} KB · ${store().persistent ? 'Speicherung im Browser aktiv' : 'Speicherung im Browser NICHT möglich'}</div>
          <div class="hint">Die Sicherung ist eine einfache JSON-Datei mit allen Kontakten, Belegen und Einstellungen. Bewahren Sie sie an einem sicheren Ort auf (z. B. verschlüsselter USB-Stick). Gesetzliche Aufbewahrungsfristen für Rechnungen bleiben bei Ihnen.</div></div></section>
      <section class="card"><div class="card-head"><h2>Beispieldaten</h2></div>
        <div class="row"><button class="btn" id="demo">${ui.icon('eye')} Beispieldaten laden</button>${m.demo ? html`<button class="btn" data-act="clear-demo">Beispieldaten entfernen</button>` : ''}<span class="hint">Ersetzt alle aktuellen Daten – zum Ausprobieren gedacht.</span></div></section>
      <section class="card"><div class="card-head"><h2>Zurücksetzen</h2></div>
        <div class="row"><button class="btn danger" id="wipe">${ui.icon('trash')} Alle Daten unwiderruflich löschen</button></div></section>`;
  }
  const store = () => KK.app.store;

  KK.views.settings = {
    manual: true,
    render(el, params, ctx) {
      const st = ctx.store.state;
      const tab = TABS.some(t => t[0] === params[0]) ? params[0] : 'unternehmen';
      const body = { unternehmen: tabCompany, steuer: tabTax, texte: tabTexts, mahnwesen: tabDunning, daten: tabData }[tab](st);
      el.innerHTML = html`<div class="page-head"><div><h1>Einstellungen</h1><div class="sub">Änderungen werden automatisch gespeichert.</div></div><span class="badge good hidden" id="saved">${ui.icon('check', 'sm')} Gespeichert</span></div>
        <div class="tabs" role="tablist">${TABS.map(([k, l]) => html`<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${l}</button>`)}</div>
        <div class="stack" style="max-width:820px">${body}</div>`.toString();

      let hideT;
      const saved = () => { const b = el.querySelector('#saved'); b.classList.remove('hidden'); clearTimeout(hideT); hideT = setTimeout(() => b.classList.add('hidden'), 1800); };
      const commit = () => { ctx.store.commit('settings'); saved(); };

      ui.on(el, 'click', '[data-tab]', (ev, b) => { location.hash = '#/einstellungen/' + b.dataset.tab; });

      // Feld-Änderungen speichern (beim Verlassen des Feldes)
      el.addEventListener('change', async ev => {
        const t = ev.target;
        if (t.name === 'vat') { st.settings.tax.kleinunternehmer = t.value === 'klein'; return commit(); }
        if (t.dataset.counter) {
          const type = t.dataset.counter, seq = st.settings.numbering[type], year = new Date().getFullYear();
          const n = parseInt(t.value, 10);
          if (!(n >= 1)) { t.value = (seq.counters[C.counterKey(seq.pattern, year)] || 0) + 1; return; }
          seq.counters[C.counterKey(seq.pattern, year)] = n - 1;
          el.querySelector('#prev-' + type).textContent = C.formatNumber(seq.pattern, n, year);
          return commit();
        }
        const path = t.dataset.s; if (!path) return;
        let v = t.type === 'checkbox' ? t.checked : t.value;
        const cast = t.dataset.cast;
        if (cast === 'int') { v = parseInt(v, 10); if (!(v >= 0)) { t.setAttribute('aria-invalid', 'true'); return; } }
        else if (cast === 'cents') { const c = v.trim() ? U.parseMoney(v) : 0; if (c == null || c < 0) { t.setAttribute('aria-invalid', 'true'); return; } v = c; t.value = c ? U.moneyInput(c) : ''; }
        else if (cast === 'pct') { if (!v.trim()) v = null; else { const n = U.parseNum(v); if (n == null) { t.setAttribute('aria-invalid', 'true'); return; } v = n; } }
        else if (cast === 'pattern') {
          if (!C.validPattern(v)) { t.setAttribute('aria-invalid', 'true'); ui.toast('Das Muster braucht eine laufende Nummer, z. B. {NNN}.', { type: 'bad' }); return; }
        } else if (typeof v === 'string') v = v.trim();
        if (path.endsWith('.iban')) { v = U.ibanNorm(v); t.value = U.ibanFmt(v); }
        if (path.endsWith('.bic')) v = U.ibanNorm(v);
        t.removeAttribute('aria-invalid');
        setPath(ctx.store.state, path, v);
        if (cast === 'pattern') { const type = path.split('.')[3], seq = st.settings.numbering[type], year = new Date().getFullYear(); el.querySelector('#prev-' + type).textContent = C.formatNumber(seq.pattern, (seq.counters[C.counterKey(seq.pattern, year)] || 0) + 1, year); }
        commit();
        if (tab === 'unternehmen') refreshCompleteness();
      });
      el.addEventListener('input', ev => {
        const t = ev.target;
        if (t.id === 'iban') { const h = el.querySelector('#ibanHint'); h.textContent = !t.value.trim() ? 'Für Zahlungsangaben und den GiroCode.' : U.ibanValid(t.value) ? '✓ gültige IBAN' : 'Die IBAN scheint ungültig zu sein.'; }
        if (t.id && t.id.startsWith('pat-')) { const type = t.id.slice(4), seq = st.settings.numbering[type], year = new Date().getFullYear(); if (C.validPattern(t.value)) el.querySelector('#prev-' + type).textContent = C.formatNumber(t.value, (seq.counters[C.counterKey(t.value, year)] || 0) + 1, year); }
      });
      function refreshCompleteness() {
        const box = el.querySelector('#complete'); if (!box) return;
        const tmp = document.createElement('div'); tmp.innerHTML = tabCompany(st).toString();
        box.innerHTML = tmp.querySelector('#complete').innerHTML;
      }

      // Logo
      const logoFile = el.querySelector('#logoFile');
      if (logoFile) logoFile.addEventListener('change', async () => {
        const file = logoFile.files[0]; if (!file) return;
        try {
          const r = await processLogo(file);
          Object.assign(st.settings.company, { logo: r.dataUrl, logoW: r.w, logoH: r.h });
          ctx.store.commit('settings'); ctx.rerender();
          ui.toast('Logo übernommen.');
        } catch (e) { ui.toast(e.message, { type: 'bad' }); }
      });
      const logoDel = el.querySelector('#logoDel');
      if (logoDel) logoDel.addEventListener('click', () => { Object.assign(st.settings.company, { logo: null, logoW: 0, logoH: 0 }); ctx.store.commit('settings'); ctx.rerender(); });

      const reset = el.querySelector('#resetTexts');
      if (reset) reset.addEventListener('click', () => { Object.assign(st.settings.defaults, S.DEFAULT_TEXTS); ctx.store.commit('settings'); ctx.rerender(); ui.toast('Standardtexte zurückgesetzt.'); });

      // Daten
      const bk = el.querySelector('#backup'); if (bk) bk.addEventListener('click', () => { KK.app.backup(); ctx.rerender(); });
      const rf = el.querySelector('#restoreFile');
      if (rf) rf.addEventListener('change', async () => {
        const file = rf.files[0]; if (!file) return;
        let text; try { text = await file.text(); } catch (e) { return ui.toast('Die Datei konnte nicht gelesen werden.', { type: 'bad' }); }
        const r = await ui.dialog({
          title: 'Sicherung einspielen',
          body: html`<p style="margin:0">Wie soll die Sicherung <strong>${file.name}</strong> übernommen werden?</p>
            <label class="check"><input type="radio" name="mode" value="merge" checked><span><strong>Zusammenführen</strong><br><span class="hint">Vorhandene Daten bleiben, neue Kontakte und Belege werden ergänzt.</span></span></label>
            <label class="check"><input type="radio" name="mode" value="replace"><span><strong>Ersetzen</strong><br><span class="hint">Alle aktuellen Daten werden durch die Sicherung ersetzt (auch Einstellungen).</span></span></label>`.toString(),
          actions: [{ label: 'Abbrechen', value: 'cancel' }, { label: 'Einspielen', value: 'ok', kind: 'primary' }],
        });
        rf.value = '';
        if (r.value !== 'ok') return;
        const res = ctx.store.importData(text, r.data.mode);
        if (!res.ok) return ui.toast(res.error, { type: 'bad' });
        ui.toast(`Sicherung eingespielt: ${res.contacts} Kontakte, ${res.documents} Belege.`);
        ctx.rerender();
      });
      const demo = el.querySelector('#demo');
      if (demo) demo.addEventListener('click', async () => {
        if (st.documents.length + st.contacts.length > 0 && !st.meta.demo && !await ui.confirm({ title: 'Beispieldaten laden?', text: 'Alle aktuellen Kontakte, Belege und Einstellungen werden durch Beispieldaten ersetzt. Erstellen Sie vorher eine Sicherung!', ok: 'Ersetzen', danger: true })) return;
        KK.demo.fill(ctx.store); ui.toast('Beispieldaten geladen.'); ctx.navigate('#/');
      });
      const wipe = el.querySelector('#wipe');
      if (wipe) wipe.addEventListener('click', async () => {
        const r = await ui.dialog({
          title: 'Alle Daten löschen?',
          body: html`<p style="margin:0">Kontakte, Belege, Einstellungen und Logo werden <strong>unwiderruflich</strong> gelöscht. Laden Sie vorher eine Sicherung herunter, falls Sie die Daten noch brauchen.</p><label class="f"><span class="lbl">Zur Bestätigung „LÖSCHEN“ eintippen</span><input name="c" autocomplete="off"></label>`.toString(),
          actions: [{ label: 'Abbrechen', value: 'cancel' }, { label: 'Endgültig löschen', value: 'ok', kind: 'danger' }],
          beforeClose: (v, d) => (v === 'ok' && d.c.trim().toUpperCase() !== 'LÖSCHEN' ? 'Bitte „LÖSCHEN“ eintippen.' : false),
        });
        if (r.value !== 'ok') return;
        ctx.store.reset(); ui.toast('Alle Daten gelöscht.'); ctx.navigate('#/');
      });
    },
  };
})(typeof self !== 'undefined' ? self : globalThis);
