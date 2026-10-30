/* Klarkontor – App-Start: Router, Navigation, Banner, Theme. */
(function (root) {
  'use strict';
  const KK = root.KK, U = KK.util, C = KK.calc, D = KK.domain, ui = KK.ui;
  const { html } = U;

  const store = KK.store.createStore();
  KK.app = { store };
  store.load();

  const ROUTES = [
    { id: 'start', path: /^\/?$/, icon: 'home', label: 'Übersicht', href: '#/', view: 'dashboard', title: 'Übersicht' },
    { id: 'kontakte', path: /^\/kontakte(?:\/([\w-]+))?$/, icon: 'users', label: 'Kontakte', href: '#/kontakte', view: 'contacts', title: 'Kontakte' },
    { id: 'belege', path: /^\/belege$/, icon: 'file', label: 'Belege', href: '#/belege', view: 'documents', title: 'Belege' },
    { id: 'beleg', path: /^\/beleg\/([\w-]+)$/, nav: 'belege', view: 'editor', title: 'Beleg' },
    { id: 'einstellungen', path: /^\/einstellungen(?:\/(\w+))?$/, icon: 'settings', label: 'Einstellungen', href: '#/einstellungen', view: 'settings', title: 'Einstellungen' },
    { id: 'hilfe', path: /^\/hilfe(?:\/(\w+))?$/, nav: 'einstellungen', view: 'help', title: 'Hilfe' },
  ];

  const $ = id => document.getElementById(id);
  let viewEl = $('view');
  let current = null; // { route, view, cleanup }

  function resolve() {
    const path = (location.hash.replace(/^#/, '') || '/').replace(/\/+$/, '') || '/';
    for (const r of ROUTES) { const m = r.path.exec(path); if (m) return { route: r, params: m.slice(1) }; }
    return { route: ROUTES[0], params: [] };
  }

  function counts() {
    const rec = D.receivables(store.state, U.today());
    const fu = D.followUps(store.state, U.today());
    return { overdue: rec.overdue.length, followups: fu.length };
  }

  function renderNav(activeId) {
    const c = counts();
    const badge = { belege: c.overdue, kontakte: c.followups };
    $('nav').innerHTML = ROUTES.filter(r => r.label).map(r => {
      const n = badge[r.id] || 0;
      const on = (r.id === activeId) ? ' aria-current="page"' : '';
      return `<a href="${r.href}"${on}>${ui.icon(r.icon)}<span>${r.label}</span>${n ? `<span class="count" title="${r.id === 'belege' ? 'Überfällige Rechnungen' : 'Fällige Wiedervorlagen'}">${n}</span>` : ''}</a>`;
    }).join('');
  }

  function renderChrome() {
    const items = html`<button type="button" role="menuitem" data-new="quote">${ui.icon('file')} Neues Angebot</button>
      <button type="button" role="menuitem" data-new="invoice">${ui.icon('coin')} Neue Rechnung</button>
      <hr><button type="button" role="menuitem" data-new="contact">${ui.icon('users')} Neuer Kontakt</button>`;
    for (const id of ['newMenu', 'newMenuM']) $(id).innerHTML = items;
    const label = html`${ui.icon('plus')} Neu`;
    $('newBtn').innerHTML = label; $('newBtnM').innerHTML = label;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    const m = store.state.meta;
    $('sideFoot').innerHTML = html`
      <div>${store.persistent ? html`${ui.icon('lock', 'sm')} Daten nur in diesem Browser` : html`<strong>Nicht gespeichert!</strong>`}</div>
      <div>${m.lastBackupAt ? `Letzte Sicherung: ${U.fmtDate(m.lastBackupAt)}` : 'Noch keine Sicherung'}</div>
      <button type="button" data-act="backup">${ui.icon('download', 'sm')} Jetzt sichern</button>
      <button type="button" data-act="theme">${ui.icon(dark ? 'sun' : 'moon', 'sm')} ${dark ? 'Helles' : 'Dunkles'} Design</button>
      <a href="#/hilfe" style="color:inherit">${ui.icon('help', 'sm')} Hilfe &amp; Hinweise</a>`.toString();
  }

  function renderBanners() {
    const m = store.state.meta, out = [];
    if (!store.persistent) out.push(html`<div class="banner bad" role="alert"><span><strong>Achtung:</strong> Ihr Browser erlaubt kein Speichern (privater Modus oder blockierte Website-Daten). Änderungen gehen beim Schließen verloren – bitte regelmäßig sichern.</span><button class="btn sm" data-act="backup">Jetzt sichern</button></div>`);
    else if (store.lastError) out.push(html`<div class="banner bad" role="alert"><span><strong>Speichern fehlgeschlagen</strong> (Speicher voll?). Bitte sofort eine Sicherung herunterladen.</span><button class="btn sm" data-act="backup">Jetzt sichern</button></div>`);
    else {
      const days = m.lastBackupAt ? U.daysBetween(m.lastBackupAt, U.today()) : null;
      const hasData = store.state.documents.length + store.state.contacts.length > 0;
      if (hasData && !m.demo && m.changesSinceBackup >= 15 && (days == null || days >= 14)) {
        out.push(html`<div class="banner"><span>${ui.icon('shield', 'sm')} Ihre Daten liegen nur in diesem Browser. Eine Sicherung ${days == null ? 'wurde noch nie erstellt' : `ist ${days} Tage alt`} – bitte jetzt sichern.</span><button class="btn sm" data-act="backup">Sicherung herunterladen</button></div>`);
      }
    }
    if (m.demo) out.push(html`<div class="banner" style="background:var(--blue-soft);color:var(--blue)"><span>${ui.icon('eye', 'sm')} Sie sehen <strong>Beispieldaten</strong>. Zum Loslegen mit eigenen Daten:</span><button class="btn sm" data-act="clear-demo">Beispieldaten entfernen</button></div>`);
    $('banners').innerHTML = out.join('');
  }

  function backup() {
    const name = `klarkontor-sicherung-${U.today()}.json`;
    ui.download(name, store.exportData(), 'application/json');
    store.markBackup();
    ui.toast('Sicherung heruntergeladen. Bewahren Sie die Datei sicher auf.');
  }
  KK.app.backup = backup;

  async function clearDemo() {
    const ok = await ui.confirm({ title: 'Beispieldaten entfernen?', text: 'Alle Beispiel-Kontakte und -Belege werden gelöscht. Danach starten Sie mit einer leeren Anwendung.', ok: 'Entfernen', danger: true });
    if (!ok) return;
    store.reset();
    ui.toast('Beispieldaten entfernt.');
    navigate('#/');
  }
  KK.app.clearDemo = clearDemo;

  function navigate(hash) { if (location.hash === hash) render(); else location.hash = hash; }
  KK.app.navigate = navigate;

  function render() {
    if (current && current.cleanup) { try { current.cleanup(); } catch (e) { console.error(e); } }
    const { route, params } = resolve();
    const view = KK.views[route.view];
    renderNav(route.nav || route.id);
    renderChrome();
    renderBanners();
    document.title = `${route.title} · Klarkontor`;
    // frischer Container, damit keine Listener früherer Ansichten übrig bleiben
    const fresh = document.createElement('main');
    fresh.id = 'view'; fresh.className = 'page'; fresh.tabIndex = -1;
    viewEl.replaceWith(fresh);
    viewEl = fresh;
    current = { route, view, cleanup: null, params };
    try {
      const r = view.render(viewEl, params, { store, navigate, rerender: render });
      if (typeof r === 'function') current.cleanup = r;
    } catch (e) {
      console.error(e);
      viewEl.innerHTML = `<div class="callout bad"><strong>Diese Ansicht konnte nicht geladen werden.</strong><br>${U.esc(e.message)}<br><a href="#/">Zur Übersicht</a></div>`;
    }
  }
  KK.views = KK.views || {};

  function start() {
    ui.initMenus();
    window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); viewEl.focus({ preventScroll: true }); });
    // Aktionen in Navigation/Banner
    document.addEventListener('click', ev => {
      const n = ev.target.closest('[data-new]');
      if (n) {
        const kind = n.dataset.new;
        if (kind === 'contact') { KK.views.contacts.openContact(null, { store, navigate }); return; }
        const doc = D.createDocument(store, kind);
        navigate('#/beleg/' + doc.id);
        return;
      }
      const a = ev.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'backup') backup();
      else if (a.dataset.act === 'clear-demo') clearDemo();
      else if (a.dataset.act === 'theme') {
        const el = document.documentElement;
        const dark = el.getAttribute('data-theme') === 'dark' || (!el.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
        const next = dark ? 'light' : 'dark';
        el.setAttribute('data-theme', next);
        try { localStorage.setItem('klarkontor.theme', next); } catch (e) { /* ignore */ }
        renderChrome();
      }
    });
    // Mehrere Änderungen in einem Durchlauf (z. B. Beispieldaten laden) führen zu genau einem Neuzeichnen
    let pending = false, reloaded = false;
    store.on(type => {
      if (type === 'error') { ui.toast('Speichern fehlgeschlagen – bitte jetzt eine Sicherung herunterladen.', { type: 'bad' }); renderBanners(); return; }
      if (type === 'load') reloaded = true; // Daten wurden von außen ersetzt (z. B. anderer Tab): auch Editor neu aufbauen
      if (pending || !current) return;
      pending = true;
      Promise.resolve().then(() => {
        pending = false;
        renderNav(current.route.nav || current.route.id);
        renderChrome(); renderBanners();
        if (!current.view.manual || reloaded) render(); // der Editor aktualisiert sich sonst selbst
        reloaded = false;
      });
    });
    window.addEventListener('storage', ev => { if (ev.key === KK.store.KEY) { KK.flush = null; if (current) current.cleanup = null; store.reload(); } });
    window.addEventListener('pagehide', () => { if (KK.flush) KK.flush(); });
    try { if (navigator.storage && navigator.storage.persist && store.persistent) navigator.storage.persist(); } catch (e) { /* ignore */ }
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
    // app.html?demo=1 (Link auf der Startseite): Beispieldaten nur laden, wenn noch nichts erfasst ist
    if (new URLSearchParams(location.search).has('demo')) {
      history.replaceState(null, '', location.pathname + location.hash);
      if (!store.state.contacts.length && !store.state.documents.length) KK.demo.fill(store);
      else setTimeout(() => ui.toast('Sie haben bereits eigene Daten – die Beispieldaten wurden nicht geladen.'), 300);
    }
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(typeof self !== 'undefined' ? self : globalThis);
