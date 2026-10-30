/* Klarkontor – Ansicht „Übersicht“ */
(function (root) {
  'use strict';
  const KK = root.KK, U = KK.util, C = KK.calc, D = KK.domain, S = KK.store, ui = KK.ui;
  const { html, raw } = U;
  KK.views = KK.views || {};

  function setupSteps(state) {
    const co = state.settings.company;
    return [
      { done: !!(co.name.trim() && co.street.trim() && co.zip.trim() && co.city.trim()), label: 'Unternehmensdaten und Anschrift eintragen', hint: 'Erscheinen auf jedem Beleg.', href: '#/einstellungen/unternehmen' },
      { done: !!(co.taxNo.trim() || co.vatId.trim()), label: 'Steuernummer oder USt-IdNr. hinterlegen', hint: 'Pflichtangabe auf Rechnungen.', href: '#/einstellungen/unternehmen' },
      { done: U.ibanValid(co.iban), label: 'Bankverbindung (IBAN) eintragen', hint: 'Für Zahlungsangaben und den GiroCode.', href: '#/einstellungen/unternehmen' },
      { done: !!(U.emailValid(co.email) && co.phone.trim()), label: 'E-Mail und Telefon ergänzen', hint: 'Nötig für E-Rechnungen (XRechnung).', href: '#/einstellungen/unternehmen' },
      { done: state.documents.some(d => d.status !== 'draft'), label: 'Erstes Angebot oder erste Rechnung festschreiben', hint: 'Dabei wird die Belegnummer vergeben.', href: '#/belege' },
    ];
  }

  function greeting(state) {
    const h = new Date().getHours();
    const g = h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend';
    const first = (state.settings.company.owner || '').trim().split(/\s+/)[0];
    return first ? `${g}, ${first}` : g;
  }

  const eurShort = c => Math.round(c / 100).toLocaleString('de-DE') + ' €';

  function chart(values, year) {
    const W = 720, H = 210, L = 46, R = 8, T = 16, B = 26;
    const max = Math.max(...values, 1);
    const step = niceStep(max / 4);
    const top = Math.max(step * Math.ceil(max / step), step);
    const bw = (W - L - R) / 12;
    const y = v => T + (H - T - B) * (1 - v / top);
    let g = '';
    for (let v = 0; v <= top + 1; v += step) g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${eurShort(v)}</text>`;
    const bars = values.map((v, i) => {
      const x = L + i * bw + bw * 0.18, w = bw * 0.64, hh = Math.max(0, H - B - y(v));
      return `<g><title>${U.MONTHS[i]} ${year}: ${U.eur(v)}</title>${v > 0 ? `<rect class="bar" x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${w.toFixed(1)}" height="${hh.toFixed(1)}" rx="3"/>` : ''}<text x="${(x + w / 2).toFixed(1)}" y="${H - 9}" text-anchor="middle">${U.MONTHS[i].slice(0, 3)}</text></g>`;
    }).join('');
    const label = `Umsatz pro Monat ${year} (nach Zahlungseingang, netto): ` + values.map((v, i) => `${U.MONTHS[i]} ${U.eur(v)}`).join(', ');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${U.esc(label)}">${g}${bars}</svg>`;
  }
  function niceStep(x) {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(x, 1))));
    const n = x / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  function guard(state) {
    const year = new Date().getFullYear();
    const cur = D.revenueByYear(state, year), prev = D.revenueByYear(state, year - 1);
    const L = C.KLEIN_LIMITS;
    const paid = cur.paidGross, open = cur.openGross;
    const pct = v => Math.min(100, (v / L.currentYear) * 100);
    const total = paid + open;
    const tone = total > L.currentYear ? 'bad' : total > L.currentYear * 0.8 ? 'warn' : 'good';
    const prevPct = Math.min(100, (prev.paidGross / L.prevYear) * 100);
    return html`<div class="card">
      <div class="card-head"><h2>Kleinunternehmer-Grenze</h2><a class="small" href="#/hilfe/kleinunternehmer">Erklärung</a></div>
      <div class="stack sm">
        <div class="row between small"><span>Laufendes Jahr ${year}</span><span class="num"><strong>${U.eur(paid)}</strong> von ${U.eur(L.currentYear)}</span></div>
        <div class="meter ${tone}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct(paid))}" aria-label="Umsatz laufendes Jahr"><i style="width:${pct(paid).toFixed(1)}%"></i></div>
        <div class="hint">${open > 0 ? `Dazu kommen ${U.eur(open)} noch offene Rechnungen – zusammen ${U.eur(total)}.` : 'Alle ausgestellten Rechnungen sind bezahlt.'}</div>
        <div class="row between small" style="margin-top:8px"><span>Vorjahr ${year - 1}</span><span class="num"><strong>${U.eur(prev.paidGross)}</strong> von ${U.eur(L.prevYear)}</span></div>
        <div class="meter ${prev.paidGross > L.prevYear ? 'bad' : 'good'}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(prevPct)}" aria-label="Umsatz Vorjahr"><i style="width:${prevPct.toFixed(1)}%"></i></div>
        ${prev.paidGross > L.prevYear ? html`<div class="callout bad small">Im Vorjahr lag der Umsatz über 25.000 €. Die Kleinunternehmerregelung gilt damit im laufenden Jahr voraussichtlich <strong>nicht mehr</strong>. Bitte mit dem Steuerberater klären.</div>` : ''}
        ${tone !== 'good' && prev.paidGross <= L.prevYear ? html`<div class="callout ${tone === 'bad' ? 'bad' : ''} small">${tone === 'bad' ? 'Die Grenze von 100.000 € ist überschritten – ab diesem Umsatz entsteht Umsatzsteuerpflicht.' : 'Sie nähern sich der Grenze von 100.000 €. Rechtzeitig mit dem Steuerberater sprechen.'}</div>` : ''}
        <div class="hint">Orientierungswert aus Ihren Zahlungseingängen (brutto = netto). Maßgeblich ist die steuerliche Bewertung – im Zweifel fragen Sie Ihre Steuerberatung.</div>
      </div></div>`;
  }

  function todoIcon(k) { return { overdue: ['alert', 'bad'], followup: ['phone', 'warn'], quote: ['clock', 'info'], draft: ['edit', ''] }[k]; }

  KK.views.dashboard = {
    render(el, params, ctx) {
      const st = ctx.store.state, today = U.today(), year = new Date().getFullYear();
      const steps = setupSteps(st), doneN = steps.filter(s => s.done).length;
      const rec = D.receivables(st, today);
      const rev = D.revenueByYear(st, year);
      const pipeline = st.contacts.filter(c => S.OPEN_STAGES.includes(c.status));
      const pipeSum = pipeline.reduce((s, c) => s + (c.value || 0), 0);
      const todos = D.todos(st, today);
      const empty = !st.documents.length && !st.contacts.length;
      const recent = st.documents.slice().sort((a, b) => (b.finalizedAt || b.createdAt).localeCompare(a.finalizedAt || a.createdAt) || b.date.localeCompare(a.date)).slice(0, 6);

      const welcome = (doneN < steps.length || empty) ? html`
        <section class="card" aria-labelledby="setupT">
          <div class="card-head"><h2 id="setupT">${empty ? 'Willkommen bei Klarkontor' : 'Einrichtung abschließen'}</h2><span class="badge accent">${doneN} von ${steps.length} erledigt</span></div>
          ${empty ? html`<p class="muted">Von der ersten Anfrage bis zur bezahlten E-Rechnung – ohne Konto und ohne Cloud. Ihre Daten bleiben in diesem Browser. In wenigen Minuten sind Sie startklar:</p>` : ''}
          <ul class="steps">${steps.map((s, i) => html`<li class="${s.done ? 'done' : ''}"><span class="no">${s.done ? ui.icon('check', 'sm') : i + 1}</span><div><a href="${s.href}"><strong>${s.label}</strong></a><div class="hint">${s.hint}</div></div></li>`)}</ul>
          ${empty ? html`<div class="row" style="margin-top:14px"><a class="btn primary" href="#/einstellungen/unternehmen">${ui.icon('settings')} Einrichtung starten</a><button class="btn" data-act="demo">${ui.icon('eye')} Mit Beispieldaten ausprobieren</button></div>` : ''}
        </section>` : '';

      el.innerHTML = html`
        <div class="page-head"><div><h1>${greeting(st)}</h1><div class="sub">${U.fmtDateLong(today)}</div></div>
          <div class="row"><button class="btn" data-new="quote">${ui.icon('file')} Angebot</button><button class="btn primary" data-new="invoice">${ui.icon('plus')} Rechnung</button></div></div>
        <div class="stack lg">
          ${welcome}
          <div class="grid cols-4">
            <div class="card kpi"><div class="l">Offene Forderungen</div><div class="v">${U.eur(rec.openSum)}</div><div class="d">${rec.open.length} ${U.plural(rec.open.length, 'Rechnung', 'Rechnungen')}</div></div>
            <div class="card kpi ${rec.overdue.length ? 'bad' : ''}"><div class="l">Davon überfällig</div><div class="v">${U.eur(rec.overdueSum)}</div><div class="d">${rec.overdue.length ? `${rec.overdue.length} ${U.plural(rec.overdue.length, 'Rechnung', 'Rechnungen')} – bitte nachfassen` : 'Nichts überfällig'}</div></div>
            <div class="card kpi"><div class="l">Umsatz ${year} (bezahlt, netto)</div><div class="v">${U.eur(rev.paidNet)}</div><div class="d">${U.eur(rev.billedNet)} berechnet</div></div>
            <div class="card kpi"><div class="l">Pipeline</div><div class="v">${U.eur(pipeSum)}</div><div class="d">${pipeline.length} ${U.plural(pipeline.length, 'offener Kontakt', 'offene Kontakte')}</div></div>
          </div>
          <div class="grid cols-2" style="align-items:start">
            <section class="card" aria-labelledby="todoT"><div class="card-head"><h2 id="todoT">Was jetzt zu tun ist</h2><span class="badge ${todos.length ? 'accent' : 'good'}">${todos.length || 'alles erledigt'}</span></div>
              ${todos.length ? html`<div>${todos.slice(0, 8).map((t, i) => { const [ic, tone] = todoIcon(t.kind); return html`<button class="todo" data-todo="${i}"><span class="dot ${tone}">${ui.icon(ic, 'sm')}</span><span><span class="t">${t.text}</span><br><span class="small muted">${t.sub}</span></span></button>`; })}${todos.length > 8 ? html`<div class="hint" style="padding-top:8px">… und ${todos.length - 8} weitere</div>` : ''}</div>`
                : html`<div class="empty"><h3>Alles im grünen Bereich</h3><div>Keine überfälligen Rechnungen, keine fälligen Wiedervorlagen.</div></div>`}
            </section>
            <div class="stack">${st.settings.tax.kleinunternehmer ? guard(st) : html`<section class="card"><div class="card-head"><h2>Pipeline</h2><a class="small" href="#/kontakte">Zum Board</a></div>${pipelineSummary(st)}</section>`}</div>
          </div>
          <section class="card" aria-labelledby="chartT"><div class="card-head"><h2 id="chartT">Umsatz ${year} pro Monat</h2><span class="small muted">nach Zahlungseingang, netto</span></div>${raw(chart(D.monthlyRevenue(st, year), year))}</section>
          <section class="card"><div class="card-head"><h2>Zuletzt bearbeitet</h2><a class="small" href="#/belege">Alle Belege</a></div>
            ${recent.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Beleg</th><th>Kunde</th><th class="right">Betrag</th><th>Status</th></tr></thead><tbody>${recent.map(d => html`<tr data-doc="${d.id}"><td><strong>${C.typeLabel(d)}</strong> <span class="muted mono small">${d.number || ''}</span></td><td>${d.client.name || html`<span class="muted">–</span>`}</td><td class="right num">${U.eur(C.compute(d).gross)}</td><td>${ui.badge(C.docState(d, today))}</td></tr>`)}</tbody></table></div>`
              : html`<div class="empty"><h3>Noch keine Belege</h3><div>Legen Sie Ihr erstes Angebot oder Ihre erste Rechnung an.</div></div>`}
          </section>
        </div>`.toString();

      el.addEventListener('click', ev => {
        const t = ev.target.closest('[data-todo]');
        if (t) {
          const item = todos[+t.dataset.todo];
          if (item.contact) KK.views.contacts.openContact(item.contact.id, ctx);
          else ctx.navigate('#/beleg/' + item.doc.id);
          return;
        }
        const r = ev.target.closest('[data-doc]');
        if (r) { ctx.navigate('#/beleg/' + r.dataset.doc); return; }
        if (ev.target.closest('[data-act="demo"]')) {
          KK.demo.fill(ctx.store); ui.toast('Beispieldaten geladen.');
        }
      });
    },
  };

  function pipelineSummary(st) {
    const rows = S.OPEN_STAGES.map(s => { const l = st.contacts.filter(c => c.status === s); return { s, n: l.length, v: l.reduce((a, c) => a + (c.value || 0), 0) }; });
    const max = Math.max(...rows.map(r => r.n), 1);
    return html`<div class="stack sm">${rows.map(r => html`<div class="row between small"><span style="width:110px">${r.s}</span><div class="meter" style="flex:1"><i style="width:${(r.n / max) * 100}%"></i></div><span class="num" style="width:90px;text-align:right">${r.n} · ${eurShort(r.v)}</span></div>`)}</div>`;
  }
})(typeof self !== 'undefined' ? self : globalThis);
