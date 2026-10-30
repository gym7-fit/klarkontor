/* Klarkontor – Ansicht „Kontakte“ (Pipeline-Board, Liste, Detail-Drawer) */
(function (root) {
  'use strict';
  const KK = root.KK, U = KK.util, C = KK.calc, D = KK.domain, S = KK.store, ui = KK.ui;
  const { html, raw } = U;
  KK.views = KK.views || {};

  const pref = {
    get(k, d) { try { return localStorage.getItem('klarkontor.' + k) || d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('klarkontor.' + k, v); } catch (e) { /* ignore */ } },
  };
  const state = { mode: pref.get('contacts.mode', 'board'), q: '', stage: 'Alle' };
  const LOG_TYPES = { note: 'Notiz', call: 'Anruf', mail: 'E-Mail', meeting: 'Treffen', status: 'Status', doc: 'Beleg' };
  const eurShort = c => c ? Math.round(c / 100).toLocaleString('de-DE') + ' €' : '';

  const docsOf = (st, c) => st.documents.filter(d => d.contactId === c.id);
  function match(c, q) {
    if (!q) return true;
    const t = (c.name + ' ' + c.person + ' ' + c.email + ' ' + c.phone + ' ' + c.city + ' ' + c.notes + ' ' + c.source).toLowerCase();
    return q.toLowerCase().split(/\s+/).every(w => t.includes(w));
  }
  const isDue = c => S.OPEN_STAGES.includes(c.status) && c.followup && c.followup <= U.today();

  function card(c, st) {
    const idx = S.STAGES.indexOf(c.status);
    return html`<div class="kcard" draggable="true" data-id="${c.id}">
      <button type="button" class="n" data-open="${c.id}">${c.name}</button>
      ${c.person ? html`<div class="small muted">${c.person}</div>` : ''}
      <div class="meta"><span class="num">${eurShort(c.value)}</span>
        ${c.followup ? html`<span class="${isDue(c) ? 'due' : ''}">${ui.icon('calendar', 'sm')} ${U.fmtDate(c.followup)}</span>` : ''}</div>
      <div class="meta"><span>${docsOf(st, c).filter(d => d.status !== 'draft').length ? `${docsOf(st, c).filter(d => d.status !== 'draft').length} Beleg(e)` : ''}</span>
        <span class="mv">${idx > 0 ? html`<button class="btn ghost icon-only sm" data-move="${c.id}" data-dir="-1" title="Eine Stufe zurück: ${S.STAGES[idx - 1]}" aria-label="Zurück nach ${S.STAGES[idx - 1]}">${ui.icon('left', 'sm')}</button>` : ''}
        ${idx < S.STAGES.length - 1 ? html`<button class="btn ghost icon-only sm" data-move="${c.id}" data-dir="1" title="Weiter: ${S.STAGES[idx + 1]}" aria-label="Weiter nach ${S.STAGES[idx + 1]}">${ui.icon('right', 'sm')}</button>` : ''}</span></div>
    </div>`;
  }

  function board(st, list) {
    return html`<div class="board" id="board">${S.STAGES.map(s => {
      const items = list.filter(c => c.status === s).sort((a, b) => (isDue(b) - isDue(a)) || (a.followup || '9').localeCompare(b.followup || '9'));
      const sum = items.reduce((a, c) => a + (c.value || 0), 0);
      return html`<section class="col" data-stage="${s}" aria-label="${s}"><div class="col-head"><h3>${s} <span class="muted">${items.length}</span></h3><span class="sum">${eurShort(sum)}</span></div>
        ${items.map(c => card(c, st))}</section>`;
    })}</div>`;
  }

  function table(st, list) {
    const rows = list.slice().sort((a, b) => (isDue(b) - isDue(a)) || b.createdAt.localeCompare(a.createdAt));
    if (!rows.length) return html`<div class="empty"><h3>Keine Kontakte gefunden</h3><div>Passen Sie Suche oder Filter an.</div></div>`;
    return html`<div class="table-wrap card" style="padding:0"><table class="table"><thead><tr><th>Name</th><th>Status</th><th class="right">Wert</th><th>Nächster Schritt</th><th>Kontakt</th><th class="right">Belege</th></tr></thead><tbody>
      ${rows.map(c => html`<tr data-id="${c.id}" tabindex="0"><td><strong>${c.name}</strong>${c.person ? html`<div class="sub">${c.person}</div>` : ''}</td><td><span class="badge ${c.status === 'Kunde' ? 'good' : c.status === 'Abgesagt' ? '' : 'accent'}">${c.status}</span></td>
        <td class="right num">${eurShort(c.value)}</td><td class="${isDue(c) ? '' : 'muted'} nowrap" ${isDue(c) ? raw('style="color:var(--red);font-weight:600"') : ''}>${c.followup ? U.fmtDate(c.followup) : '–'}</td>
        <td class="small">${c.email || ''}${c.email && c.phone ? html`<br>` : ''}${c.phone || ''}</td><td class="right num">${docsOf(st, c).filter(d => d.status !== 'draft').length || ''}</td></tr>`)}
    </tbody></table></div>`;
  }

  /* ---------- Detail-Drawer ---------- */
  function timelineHtml(c) {
    return c.log.length ? html`<div class="timeline">${c.log.map(l => html`<div><span class="d">${U.fmtDate(l.date)}</span><span><span class="badge" style="margin-right:6px">${LOG_TYPES[l.type] || 'Notiz'}</span>${l.text}</span></div>`)}</div>`
      : html`<div class="hint">Noch keine Einträge.</div>`;
  }

  function openContact(id, ctx) {
    const store = (ctx && ctx.store) || KK.app.store;
    const navigate = (ctx && ctx.navigate) || KK.app.navigate;
    const st = store.state;
    const isNew = !id;
    const c = isNew ? S.normContact({ status: 'Neu' }) : D.byId(st.contacts, id);
    if (!c) return Promise.resolve();
    const docs = isNew ? [] : docsOf(st, c).sort((a, b) => b.date.localeCompare(a.date));
    const f = (name, label, val, o = {}) => html`<label class="f ${o.cls || ''}"><span class="lbl">${label}</span><input name="${name}" value="${val == null ? '' : val}" ${o.type ? raw(`type="${o.type}"`) : ''} ${o.ph ? raw(`placeholder="${U.esc(o.ph)}"`) : ''} ${o.list ? raw(`list="${o.list}"`) : ''} ${o.mode ? raw(`inputmode="${o.mode}"`) : ''} autocomplete="off"></label>`;
    const body = html`
      <div class="fields">
        <label class="f c8"><span class="lbl">Name / Firma *</span><input name="name" value="${c.name}" autocomplete="off" placeholder="z. B. Schreinerei Huber GmbH" autofocus></label>
        <div class="c4"><label class="f"><span class="lbl">Typ</span><select name="isBusiness"><option value="1" ${c.isBusiness ? 'selected' : ''}>Unternehmen</option><option value="0" ${!c.isBusiness ? 'selected' : ''}>Privatperson</option></select></label></div>
        ${f('person', 'Ansprechpartner', c.person, { cls: 'c6' })}
        ${f('salutation', 'Briefanrede', c.salutation, { cls: 'c6', list: 'saluts', ph: 'Sehr geehrte Frau …' })}
        ${f('email', 'E-Mail', c.email, { cls: 'c6', type: 'email' })}
        ${f('phone', 'Telefon', c.phone, { cls: 'c6', type: 'tel' })}
        ${f('street', 'Straße und Hausnummer', c.street)}
        ${f('zip', 'PLZ', c.zip, { cls: 'c3 keep', mode: 'numeric' })}
        ${f('city', 'Ort', c.city, { cls: 'c6 keep' })}
        <label class="f c3 keep"><span class="lbl">Land</span><select name="country">${U.COUNTRIES.map(([k, n]) => html`<option value="${k}" ${(c.country || 'DE') === k ? 'selected' : ''}>${n}</option>`)}</select></label>
        ${f('vatId', 'USt-IdNr. (falls vorhanden)', c.vatId, { cls: 'c6' })}
        ${f('buyerRef', 'Käuferreferenz / Leitweg-ID', c.buyerRef, { cls: 'c6', ph: 'z. B. 04011000-12345-34' })}
        <label class="f c4"><span class="lbl">Status</span><select name="status">${S.STAGES.map(s => html`<option ${c.status === s ? 'selected' : ''}>${s}</option>`)}</select></label>
        <label class="f c4"><span class="lbl">Möglicher Auftragswert</span><div class="input-suffix"><input name="value" inputmode="decimal" value="${c.value ? U.moneyInput(c.value) : ''}" placeholder="0,00"><span>€</span></div></label>
        <label class="f c4"><span class="lbl">Nächster Schritt am</span><input type="date" name="followup" value="${c.followup || ''}"></label>
        ${f('source', 'Quelle (Empfehlung, Messe, Google …)', c.source)}
        <label class="f"><span class="lbl">Notizen</span><textarea name="notes" placeholder="Was braucht die Person? Wie kennen Sie sich?">${c.notes}</textarea></label>
      </div>
      <datalist id="saluts"><option value="Sehr geehrte Damen und Herren"><option value="Sehr geehrter Herr "><option value="Sehr geehrte Frau "><option value="Hallo "></datalist>
      ${isNew ? '' : html`
        <section><h3 class="t" style="margin-bottom:8px">Verlauf</h3>
          <div class="row" style="margin-bottom:8px"><select id="logType" style="width:auto" aria-label="Art des Eintrags"><option value="note">Notiz</option><option value="call">Anruf</option><option value="mail">E-Mail</option><option value="meeting">Treffen</option></select>
            <input id="logText" aria-label="Neuer Verlaufseintrag" placeholder="Kurz festhalten, was besprochen wurde …" style="flex:1;min-width:160px"><button type="button" class="btn" id="logAdd">${ui.icon('plus', 'sm')} Eintrag</button></div>
          <div id="timeline">${timelineHtml(c)}</div></section>
        <section><div class="card-head"><h3 class="t" style="margin:0">Belege</h3><div class="row"><button type="button" class="btn sm" id="mkQuote">${ui.icon('file', 'sm')} Angebot</button><button type="button" class="btn sm" id="mkInvoice">${ui.icon('coin', 'sm')} Rechnung</button></div></div>
          ${docs.length ? html`<div class="list">${docs.map(d => html`<a class="link-row row between" href="#/beleg/${d.id}" data-close><span><strong>${C.typeLabel(d)}</strong> <span class="mono small muted">${d.number || ''}</span></span><span class="row"><span class="num small">${U.eur(C.compute(d).gross)}</span>${ui.badge(C.docState(d))}</span></a>`)}</div>` : html`<div class="hint">Noch keine Belege für diesen Kontakt.</div>`}
        </section>`}`;

    const actions = [];
    if (!isNew) actions.push({ label: 'Löschen', value: 'delete', kind: 'danger' });
    actions.push({ label: 'Abbrechen', value: 'cancel' }, { label: isNew ? 'Kontakt anlegen' : 'Speichern', value: 'save', kind: 'primary' });

    return ui.dialog({
      title: isNew ? 'Neuer Kontakt' : c.name, body: body.toString(), actions, size: 'drawer',
      onOpen(dlg, finish) {
        dlg.querySelectorAll('[data-close]').forEach(a => a.addEventListener('click', () => finish('cancel')));
        if (isNew) return;
        const add = () => {
          const t = dlg.querySelector('#logText').value.trim();
          if (!t) return;
          D.addLog(c, dlg.querySelector('#logType').value, t);
          store.commit('contact:log');
          dlg.querySelector('#logText').value = '';
          dlg.querySelector('#timeline').innerHTML = timelineHtml(c).toString();
        };
        dlg.querySelector('#logAdd').addEventListener('click', add);
        dlg.querySelector('#logText').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
        const mk = type => () => { const d = D.createDocument(store, type, { contactId: c.id }); finish('cancel'); navigate('#/beleg/' + d.id); };
        dlg.querySelector('#mkQuote').addEventListener('click', mk('quote'));
        dlg.querySelector('#mkInvoice').addEventListener('click', mk('invoice'));
      },
      async beforeClose(value, v) {
        if (value === 'delete') {
          const n = docsOf(st, c).length;
          const ok = await ui.confirm({ title: 'Kontakt löschen?', text: `„${c.name}“ wird gelöscht.${n ? ` Die ${n} zugehörigen Belege bleiben erhalten (mit den Empfängerdaten zum Zeitpunkt der Erstellung).` : ''}`, ok: 'Löschen', danger: true });
          if (!ok) return true;
          D.deleteContact(store, c.id);
          ui.toast('Kontakt gelöscht.');
          return false;
        }
        if (!v.name.trim()) return 'Bitte einen Namen oder eine Firma angeben.';
        if (v.email.trim() && !U.emailValid(v.email)) return 'Die E-Mail-Adresse ist nicht gültig.';
        const val = v.value.trim() ? U.parseMoney(v.value) : 0;
        if (val == null || val < 0) return 'Der Auftragswert ist keine gültige Zahl.';
        const data = {
          name: v.name.trim(), person: v.person.trim(), salutation: v.salutation.trim(), email: v.email.trim(), phone: v.phone.trim(),
          street: v.street.trim(), zip: v.zip.trim(), city: v.city.trim(), country: v.country, vatId: v.vatId.trim(), buyerRef: v.buyerRef.trim(),
          isBusiness: v.isBusiness === '1', status: v.status, value: val, followup: v.followup, source: v.source.trim(), notes: v.notes.trim(),
        };
        if (isNew) { D.createContact(store, data); ui.toast('Kontakt angelegt.'); } else D.updateContact(store, c.id, data);
        return false;
      },
    });
  }

  KK.views.contacts = {
    openContact,
    render(el, params, ctx) {
      const st = ctx.store.state;
      const list = st.contacts.filter(c => match(c, state.q) && (state.mode === 'board' || state.stage === 'Alle' || c.status === state.stage));
      el.innerHTML = html`
        <div class="page-head"><div><h1>Kontakte</h1><div class="sub">${st.contacts.length} ${U.plural(st.contacts.length, 'Kontakt', 'Kontakte')} · Pipeline-Wert ${eurShort(st.contacts.filter(c => S.OPEN_STAGES.includes(c.status)).reduce((s, c) => s + (c.value || 0), 0)) || '0 €'}</div></div>
          <button class="btn primary" id="newContact">${ui.icon('plus')} Neuer Kontakt</button></div>
        <div class="row between" style="margin-bottom:14px">
          <div class="row"><label class="sr-only" for="q">Kontakte durchsuchen</label><div class="toolbar-search"><input id="q" type="search" placeholder="Suchen …" value="${state.q}"><span>${ui.icon('search')}</span></div>
            <div class="seg" role="group" aria-label="Ansicht"><button data-mode="board" aria-pressed="${state.mode === 'board'}">Board</button><button data-mode="list" aria-pressed="${state.mode === 'list'}">Liste</button></div></div>
          ${state.mode === 'list' ? html`<div class="chips" role="group" aria-label="Status filtern">${['Alle', ...S.STAGES].map(s => html`<button class="chip" data-stage="${s}" aria-pressed="${state.stage === s}">${s} ${s === 'Alle' ? st.contacts.length : st.contacts.filter(c => c.status === s).length}</button>`)}</div>` : ''}
        </div>
        ${!st.contacts.length ? html`<div class="card empty"><h3>Noch keine Kontakte</h3><div>Halten Sie Interessenten fest und behalten Sie nächste Schritte im Blick – vom ersten Kontakt bis zum Auftrag.</div><button class="btn primary" id="newContact2">${ui.icon('plus')} Ersten Kontakt anlegen</button></div>`
          : state.mode === 'board' ? board(st, list) : table(st, list)}`.toString();

      const rerender = () => ctx.rerender();
      const nc = () => openContact(null, ctx);
      el.querySelector('#newContact').addEventListener('click', nc);
      const nc2 = el.querySelector('#newContact2'); if (nc2) nc2.addEventListener('click', nc);
      const q = el.querySelector('#q');
      if (q) q.addEventListener('input', U.debounce(() => { state.q = q.value; rerender(); const n = document.getElementById('q'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 200));
      ui.on(el, 'click', '[data-mode]', (ev, b) => { state.mode = b.dataset.mode; pref.set('contacts.mode', state.mode); rerender(); });
      ui.on(el, 'click', '[data-stage].chip', (ev, b) => { state.stage = b.dataset.stage; rerender(); });
      ui.on(el, 'click', '[data-move]', (ev, b) => {
        ev.stopPropagation();
        const c = D.byId(st.contacts, b.dataset.move);
        D.updateContact(ctx.store, c.id, { status: S.STAGES[S.STAGES.indexOf(c.status) + Number(b.dataset.dir)] });
      });
      const open = (ev, t) => { if (ev.target.closest('[data-move]')) return; openContact(t.dataset.id, ctx); };
      ui.on(el, 'click', '.kcard, tr[data-id]', open);
      ui.on(el, 'keydown', 'tr[data-id]', (ev, t) => { if (ev.key === 'Enter' && ev.target === t) openContact(t.dataset.id, ctx); });
      // Drag & Drop zwischen den Spalten
      ui.on(el, 'dragstart', '.kcard', (ev, t) => { ev.dataTransfer.setData('text/plain', t.dataset.id); ev.dataTransfer.effectAllowed = 'move'; t.classList.add('dragging'); });
      ui.on(el, 'dragend', '.kcard', (ev, t) => t.classList.remove('dragging'));
      el.querySelectorAll('.col').forEach(col => {
        col.addEventListener('dragover', ev => { ev.preventDefault(); col.classList.add('over'); });
        col.addEventListener('dragleave', () => col.classList.remove('over'));
        col.addEventListener('drop', ev => {
          ev.preventDefault(); col.classList.remove('over');
          const id = ev.dataTransfer.getData('text/plain'), c = D.byId(st.contacts, id);
          if (c && c.status !== col.dataset.stage) D.updateContact(ctx.store, id, { status: col.dataset.stage });
        });
      });
      if (params && params[0]) setTimeout(() => openContact(params[0], ctx).then(() => history.replaceState(null, '', '#/kontakte')), 0);
    },
  };
})(typeof self !== 'undefined' ? self : globalThis);
