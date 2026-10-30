/* Klarkontor – UI-Helfer (Icons, Dialoge, Toasts, Menüs, Download). Nur Browser. */
(function (root) {
  'use strict';
  const U = root.KK.util;
  const { html, raw, esc } = U;

  /* ---------- Icons (Linien-Stil, 24er Raster) ---------- */
  const ICONS = {
    home: '<path d="M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.4c2.2.7 3.5 2.6 3.5 5.6"/>',
    file: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M5 12.5l4.5 4.5L19 7"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>', upload: '<path d="M12 15V3M7 8l5-5 5 5M4 20h16"/>',
    send: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>', copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>', alert: '<path d="M12 3L2 20h20z"/><path d="M12 10v5M12 18v.01"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M14.8 9.2A3.5 3.5 0 009 11m-.4 2a3.5 3.5 0 005.8 1.8M7.5 11h5M7.5 13h5"/>',
    right: '<path d="M9 6l6 6-6 6"/>', left: '<path d="M15 6l-6 6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.2M12 17v.01"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A15 15 0 013 6a2 2 0 012-2z"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>', downarrow: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>', moon: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
    link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', undo: '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"/>',
  };
  const icon = (name, cls) => raw(`<svg class="icon${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`);

  /* ---------- Toasts ---------- */
  function toast(msg, o = {}) {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.className = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast' + (o.type === 'bad' ? ' bad' : '');
    t.innerHTML = `<span>${esc(msg)}</span>`;
    if (o.actionLabel) {
      const b = document.createElement('button');
      b.textContent = o.actionLabel;
      b.addEventListener('click', () => { t.remove(); o.onAction && o.onAction(); });
      t.appendChild(b);
    }
    box.appendChild(t);
    setTimeout(() => t.remove(), o.ms || (o.type === 'bad' ? 7000 : 4200));
  }

  /* ---------- Dialoge ---------- */
  function formValues(dlg) {
    const out = {};
    dlg.querySelectorAll('[name]').forEach(el => {
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value;
    });
    return out;
  }
  // actions: [{label, value, kind: 'primary'|'danger'|'', validate: true}] – "cancel" schließt immer ohne Validierung
  function dialog({ title, body, actions = [], size = '', onOpen, beforeClose, dismissValue = null }) {
    return new Promise(resolve => {
      const dlg = document.createElement('dialog');
      dlg.className = size;
      const id = 'dlg' + Math.random().toString(36).slice(2, 7);
      dlg.setAttribute('aria-labelledby', id);
      dlg.innerHTML = `<div class="dlg-head"><h2 id="${id}">${esc(title)}</h2><button type="button" class="btn ghost icon-only" data-x aria-label="Schließen">${icon('x')}</button></div>
        <form class="dlg-form" style="display:contents" novalidate><div class="dlg-body"></div><div class="dlg-err err-text hidden" role="alert" style="padding:0 22px 8px"></div>
        <div class="dlg-foot"></div></form>`;
      const bodyEl = dlg.querySelector('.dlg-body');
      if (body instanceof Node) bodyEl.appendChild(body); else bodyEl.innerHTML = String(body || '');
      const foot = dlg.querySelector('.dlg-foot');
      if (!actions.length) foot.remove();
      const form = dlg.querySelector('form');
      let closed = false;
      const finish = (value) => {
        if (closed) return; closed = true;
        const data = formValues(dlg);
        try { dlg.close(); } catch (e) { /* ignore */ }
        dlg.remove();
        resolve({ value, data });
      };
      actions.forEach(a => {
        const b = document.createElement('button');
        b.type = a.kind === 'primary' ? 'submit' : 'button';
        b.className = 'btn ' + (a.kind || '');
        b.innerHTML = (a.icon ? String(icon(a.icon)) : '') + esc(a.label);
        b.dataset.value = a.value;
        b.addEventListener('click', async ev => {
          if (a.kind === 'primary') ev.preventDefault();
          if (a.value === 'cancel' || a.value === null) return finish(a.value);
          const err = dlg.querySelector('.dlg-err');
          if (beforeClose) {
            const r = await beforeClose(a.value, formValues(dlg), dlg);
            if (r) { err.textContent = typeof r === 'string' ? r : ''; err.classList.toggle('hidden', typeof r !== 'string'); return; }
          }
          finish(a.value);
        });
        foot.appendChild(b);
      });
      form.addEventListener('submit', ev => { ev.preventDefault(); const p = foot && foot.querySelector('button[type=submit]'); if (p) p.click(); });
      dlg.querySelector('[data-x]').addEventListener('click', () => finish(dismissValue));
      dlg.addEventListener('cancel', ev => { ev.preventDefault(); finish(dismissValue); });
      dlg.addEventListener('click', ev => { if (ev.target === dlg) finish(dismissValue); });
      document.body.appendChild(dlg);
      dlg.showModal();
      if (onOpen) onOpen(dlg, finish);
      const first = dlg.querySelector('[autofocus], input:not([type=hidden]):not([readonly]), select, textarea');
      if (first && !dlg.contains(document.activeElement)) first.focus();
      else if (!first) (foot && foot.querySelector('button.primary, button')) ?.focus();
    });
  }
  async function confirm({ title, text, ok = 'OK', danger = false, cancel = 'Abbrechen' }) {
    const r = await dialog({
      title, body: html`<p style="margin:0">${text}</p>`.toString(),
      actions: [{ label: cancel, value: 'cancel' }, { label: ok, value: 'ok', kind: danger ? 'danger' : 'primary' }],
    });
    return r.value === 'ok';
  }

  /* ---------- Menüs ---------- */
  function initMenus() {
    const closeAll = except => document.querySelectorAll('.menu:not(.hidden)').forEach(m => {
      if (m !== except) { m.classList.add('hidden'); const t = m.parentElement.querySelector('[data-menu-toggle]'); if (t) t.setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('click', ev => {
      const tg = ev.target.closest('[data-menu-toggle]');
      if (tg) {
        const menu = tg.parentElement.querySelector('.menu');
        const open = menu.classList.contains('hidden');
        closeAll(menu);
        menu.classList.toggle('hidden', !open);
        tg.setAttribute('aria-expanded', String(open));
        if (open) { const f = menu.querySelector('button, a'); if (f && ev.detail === 0) f.focus(); }
        return;
      }
      if (ev.target.closest('.menu button, .menu a')) { closeAll(); return; }
      closeAll();
    });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closeAll(); });
  }

  /* ---------- Sonstiges ---------- */
  function download(name, data, mime = 'application/octet-stream') {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function openBlob(data, mime) {
    const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: mime }));
    const w = window.open(url, '_blank', 'noopener');
    if (!w) { toast('Das Pop-up wurde blockiert – bitte Pop-ups für diese Seite erlauben.', { type: 'bad' }); }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }
  const badge = (state, extra) => html`<span class="badge ${state.tone}">${state.label}${extra || ''}</span>`;
  function on(rootEl, type, selector, fn) {
    rootEl.addEventListener(type, ev => { const t = ev.target.closest(selector); if (t && rootEl.contains(t)) fn(ev, t); });
  }
  function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 320) + 'px'; }

  root.KK.ui = { icon, toast, dialog, confirm, initMenus, download, openBlob, badge, on, autosize, formValues };
})(typeof self !== 'undefined' ? self : globalThis);
