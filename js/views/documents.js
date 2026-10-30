/* Klarkontor – Ansicht „Belege“ (Liste mit Filtern, Suche, Export) */
(function (root) {
  'use strict';
  const KK = root.KK, U = KK.util, C = KK.calc, D = KK.domain, ui = KK.ui;
  const { html } = U;
  KK.views = KK.views || {};

  const f = { tab: 'alle', q: '', year: 'alle' };
  const TABS = [
    ['alle', 'Alle'], ['rechnung', 'Rechnungen'], ['angebot', 'Angebote'], ['offen', 'Offen'], ['ueberfaellig', 'Überfällig'], ['entwurf', 'Entwürfe'],
  ];

  function filtered(st) {
    const today = U.today();
    return st.documents.filter(d => {
      const s = C.docState(d, today);
      if (f.tab === 'rechnung' && d.type !== 'invoice') return false;
      if (f.tab === 'angebot' && d.type !== 'quote') return false;
      if (f.tab === 'offen' && !(C.isReceivable(d) || (d.type === 'quote' && s.key === 'open'))) return false;
      if (f.tab === 'ueberfaellig' && s.key !== 'overdue') return false;
      if (f.tab === 'entwurf' && d.status !== 'draft') return false;
      if (f.year !== 'alle' && String(U.yearOf(d.date)) !== f.year) return false;
      if (f.q) {
        const t = `${d.number || ''} ${d.client.name} ${d.client.person} ${d.title} ${d.items.map(i => i.desc).join(' ')} ${C.typeLabel(d)}`.toLowerCase();
        if (!f.q.toLowerCase().split(/\s+/).every(w => t.includes(w))) return false;
      }
      return true;
    }).sort((a, b) => (a.status === 'draft') !== (b.status === 'draft') ? (a.status === 'draft' ? -1 : 1) : b.date.localeCompare(a.date) || (b.number || '').localeCompare(a.number || '', 'de', { numeric: true }));
  }

  function exportDialog(ctx) {
    const st = ctx.store.state;
    const years = [...new Set(st.documents.filter(d => d.status !== 'draft').map(d => U.yearOf(d.date)).concat(new Date().getFullYear()))].sort((a, b) => b - a);
    ui.dialog({
      title: 'Export für die Steuerberatung',
      body: html`<p class="muted" style="margin:0">CSV-Dateien mit Semikolon und deutschem Zahlenformat – direkt in Excel oder LibreOffice zu öffnen.</p>
        <label class="f"><span class="lbl">Jahr</span><select name="year">${years.map(y => html`<option>${y}</option>`)}</select></label>
        <label class="check"><input type="radio" name="kind" value="income" checked><span><strong>Einnahmen (Zahlungseingänge)</strong><br><span class="hint">Alle Zahlungen des Jahres mit Rechnungsnummer – Grundlage für die Einnahmenüberschussrechnung.</span></span></label>
        <label class="check"><input type="radio" name="kind" value="invoices"><span><strong>Rechnungsübersicht</strong><br><span class="hint">Alle ausgestellten Rechnungen und Stornos des Jahres mit Netto, USt, Brutto und Zahlstatus.</span></span></label>`.toString(),
      actions: [{ label: 'Abbrechen', value: 'cancel' }, { label: 'CSV herunterladen', value: 'ok', kind: 'primary', icon: 'download' }],
    }).then(r => {
      if (r.value !== 'ok') return;
      const year = +r.data.year, kind = r.data.kind;
      const rows = kind === 'income' ? KK.export.income(st, year) : KK.export.invoices(st, year);
      ui.download(`klarkontor-${kind === 'income' ? 'einnahmen' : 'rechnungen'}-${year}.csv`, KK.export.toCsv(rows), 'text/csv;charset=utf-8');
    });
  }

  KK.views.documents = {
    render(el, params, ctx) {
      const st = ctx.store.state, today = U.today();
      const list = filtered(st);
      const years = [...new Set(st.documents.map(d => U.yearOf(d.date)))].sort((a, b) => b - a);
      const sum = list.filter(d => d.status !== 'draft' && !(d.type === 'invoice' && d.status === 'cancelled')).reduce((s, d) => s + (d.type === 'invoice' ? C.compute(d).gross : 0), 0);
      const counts = {
        ueberfaellig: st.documents.filter(d => C.docState(d, today).key === 'overdue').length,
        entwurf: st.documents.filter(d => d.status === 'draft').length,
      };
      el.innerHTML = html`
        <div class="page-head"><div><h1>Belege</h1><div class="sub">${st.documents.length} ${U.plural(st.documents.length, 'Beleg', 'Belege')}</div></div>
          <div class="row"><button class="btn" id="export">${ui.icon('download')} Export</button><button class="btn" data-new="quote">${ui.icon('file')} Angebot</button><button class="btn primary" data-new="invoice">${ui.icon('plus')} Rechnung</button></div></div>
        <div class="tabs" role="tablist">${TABS.map(([k, l]) => html`<button role="tab" data-tab="${k}" aria-selected="${f.tab === k}">${l}${counts[k] ? html` <span class="badge ${k === 'ueberfaellig' ? 'bad' : ''}">${counts[k]}</span>` : ''}</button>`)}</div>
        <div class="row" style="margin-bottom:14px"><div class="toolbar-search"><label class="sr-only" for="q">Belege durchsuchen</label><input id="q" type="search" placeholder="Nummer, Kunde, Leistung …" value="${f.q}"><span>${ui.icon('search')}</span></div>
          <label class="sr-only" for="yr">Jahr</label><select id="yr" style="width:auto"><option value="alle">Alle Jahre</option>${years.map(y => html`<option ${f.year === String(y) ? 'selected' : ''}>${y}</option>`)}</select></div>
        ${list.length ? html`<div class="card table-wrap" style="padding:0"><table class="table"><thead><tr><th>Nummer</th><th>Art</th><th>Kunde</th><th>Datum</th><th>Fällig / gültig bis</th><th class="right">Betrag</th><th>Status</th></tr></thead><tbody>
          ${list.map(d => { const s = C.docState(d, today); return html`<tr data-id="${d.id}" tabindex="0"><td class="mono nowrap">${d.number || html`<span class="muted">Entwurf</span>`}</td><td>${C.typeLabel(d)}</td><td><strong>${d.client.name || '–'}</strong>${d.title ? html`<div class="sub">${d.title}</div>` : ''}</td><td class="nowrap">${U.fmtDate(d.date)}</td><td class="nowrap ${s.key === 'overdue' ? '' : 'muted'}" ${s.key === 'overdue' ? U.raw('style="color:var(--red);font-weight:600"') : ''}>${C.isStorno(d) ? '' : U.fmtDate(d.due)}</td><td class="right num"><strong>${U.eur(C.compute(d).gross)}</strong></td><td>${ui.badge(s)}</td></tr>`; })}
          </tbody></table></div><div class="hint" style="margin-top:8px">${list.length} ${U.plural(list.length, 'Beleg', 'Belege')} · Rechnungssumme (ohne Entwürfe/Stornos): <strong>${U.eur(sum)}</strong></div>`
          : html`<div class="card empty"><h3>${st.documents.length ? 'Keine Belege gefunden' : 'Noch keine Belege'}</h3><div>${st.documents.length ? 'Passen Sie Filter oder Suche an.' : 'Erstellen Sie Ihr erstes Angebot oder Ihre erste Rechnung – in wenigen Minuten, mit PDF und E-Rechnung.'}</div>${st.documents.length ? '' : html`<button class="btn primary" data-new="invoice">${ui.icon('plus')} Rechnung erstellen</button>`}</div>`}`.toString();

      const rerender = () => ctx.rerender();
      ui.on(el, 'click', '[data-tab]', (ev, b) => { f.tab = b.dataset.tab; rerender(); });
      const q = el.querySelector('#q');
      q.addEventListener('input', U.debounce(() => { f.q = q.value; rerender(); const n = document.getElementById('q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200));
      el.querySelector('#yr').addEventListener('change', e => { f.year = e.target.value; rerender(); });
      el.querySelector('#export').addEventListener('click', () => exportDialog(ctx));
      ui.on(el, 'click', 'tr[data-id]', (ev, t) => ctx.navigate('#/beleg/' + t.dataset.id));
      ui.on(el, 'keydown', 'tr[data-id]', (ev, t) => { if (ev.key === 'Enter') ctx.navigate('#/beleg/' + t.dataset.id); });
    },
  };
})(typeof self !== 'undefined' ? self : globalThis);
