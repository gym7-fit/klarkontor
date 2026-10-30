/* Klarkontor – Datenspeicher (localStorage, Schema v2, Migration, Backup/Restore). Läuft im Browser und in Node. */
(function (root, factory) {
  const U = (typeof module === 'object' && module.exports) ? require('./util.js') : root.KK.util;
  const api = factory(U);
  root.KK = root.KK || {};
  root.KK.store = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function (U) {
  'use strict';

  const KEY = 'klarkontor.data.v2';
  const LEGACY_KEY = 'klarkontor-contacts';
  const VERSION = 2;
  const STAGES = ['Neu', 'Angeschrieben', 'Antwort', 'Termin', 'Angebot', 'Kunde', 'Abgesagt'];
  const OPEN_STAGES = ['Neu', 'Angeschrieben', 'Antwort', 'Termin', 'Angebot'];

  const DEFAULT_TEXTS = {
    quoteIntro: 'vielen Dank für Ihre Anfrage. Gerne unterbreite ich Ihnen folgendes Angebot:',
    quoteClosing: 'Dieses Angebot ist gültig bis zum {gueltig_bis}. Bei Fragen melde ich mich gern – ich freue mich auf Ihre Rückmeldung.',
    invoiceIntro: 'für die erbrachten Leistungen stelle ich Ihnen folgende Rechnung:',
    invoiceClosing: 'Bitte überweisen Sie den Rechnungsbetrag bis zum {faellig} unter Angabe der Rechnungsnummer {nummer} auf das unten genannte Konto. Vielen Dank für Ihren Auftrag!',
  };

  function defaultState() {
    return {
      version: VERSION,
      meta: { createdAt: U.today(), rev: 0, lastBackupAt: null, changesSinceBackup: 0, welcomeDismissed: false, legacyMigrated: false, demo: false },
      settings: {
        company: {
          name: '', owner: '', street: '', zip: '', city: '', country: 'DE', email: '', phone: '', website: '',
          taxNo: '', vatId: '', iban: '', bic: '', bankName: '', logo: null, logoW: 0, logoH: 0,
        },
        tax: { kleinunternehmer: true },
        numbering: {
          invoice: { pattern: 'RE-{YYYY}-{NNN}', counters: {} },
          quote: { pattern: 'AN-{YYYY}-{NNN}', counters: {} },
        },
        defaults: { paymentDays: 14, quoteValidDays: 14, ...DEFAULT_TEXTS, footer: '' },
        dunning: { baseRate: null, lumpSum: true, feeReminder: 0, feeDun1: 0, feeDun2: 0 },
      },
      contacts: [],
      documents: [],
    };
  }

  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  // füllt fehlende Felder aus den Standardwerten (rekursiv für Objekte)
  function fill(target, defaults) {
    for (const k of Object.keys(defaults)) {
      if (isObj(defaults[k])) {
        if (!isObj(target[k])) target[k] = {};
        fill(target[k], defaults[k]);
      } else if (target[k] === undefined) {
        target[k] = Array.isArray(defaults[k]) ? defaults[k].slice() : defaults[k];
      }
    }
    return target;
  }

  function normContact(c) {
    const o = Object.assign({
      id: U.uid('c'), name: '', person: '', salutation: '', email: '', phone: '', street: '', zip: '', city: '', country: 'DE',
      vatId: '', buyerRef: '', isBusiness: true, status: 'Neu', value: 0, notes: '', followup: '', source: '', createdAt: U.today(), log: [],
    }, c);
    if (!STAGES.includes(o.status)) o.status = 'Neu';
    if (!Array.isArray(o.log)) o.log = [];
    o.value = Math.round(Number(o.value) || 0);
    return o;
  }

  function normDoc(d) {
    const o = Object.assign({
      id: U.uid('d'), type: 'invoice', number: null, status: 'draft', contactId: null,
      client: {}, date: U.today(), serviceDate: '', serviceEnd: '', due: '', title: '', intro: '', closing: '', reference: '',
      items: [], discount: null, klein: true, payments: [], dunnings: [], sentAt: '', quoteId: null, invoiceId: null,
      cancelsId: null, cancelledById: null, createdAt: U.today(), finalizedAt: '', notes: '', einvoice: { email: '', buyerRef: '' },
    }, d);
    o.client = Object.assign({ name: '', person: '', salutation: '', street: '', zip: '', city: '', country: 'DE', email: '', vatId: '', buyerRef: '', isBusiness: true }, o.client);
    o.einvoice = Object.assign({ email: '', buyerRef: '' }, o.einvoice);
    for (const k of ['items', 'payments', 'dunnings']) if (!Array.isArray(o[k])) o[k] = [];
    o.items = o.items.map(it => Object.assign({ id: U.uid('i'), desc: '', qty: 1, unit: 'stk', price: 0, vat: 19 }, it));
    return o;
  }

  function normalize(state) {
    const s = fill(isObj(state) ? state : {}, defaultState());
    s.version = VERSION;
    s.contacts = (Array.isArray(s.contacts) ? s.contacts : []).filter(isObj).map(normContact);
    s.documents = (Array.isArray(s.documents) ? s.documents : []).filter(isObj).map(normDoc);
    const co = s.settings.company;
    if (co.logo && !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(co.logo)) { co.logo = null; co.logoW = 0; co.logoH = 0; }
    for (const t of ['invoice', 'quote']) {
      const n = s.settings.numbering[t];
      if (typeof n.pattern !== 'string' || !/\{N+\}/.test(n.pattern)) n.pattern = defaultState().settings.numbering[t].pattern;
      if (!isObj(n.counters)) n.counters = {};
    }
    return s;
  }

  // alter Akquise-Tracker (v1) -> Kontakte
  function migrateLegacy(raw) {
    let arr;
    try { arr = JSON.parse(raw); } catch (e) { return []; }
    if (!Array.isArray(arr)) return [];
    return arr.filter(isObj).map(c => {
      const contact = String(c.contact || '');
      return normContact({
        id: c.id || U.uid('c'), name: String(c.name || 'Ohne Namen'),
        email: contact.includes('@') ? contact : '', phone: contact && !contact.includes('@') ? contact : '',
        status: c.status, notes: c.notes || '', followup: c.followup || '', createdAt: c.createdAt || U.today(),
        log: [{ id: U.uid('l'), date: c.createdAt || U.today(), type: 'note', text: 'Aus dem alten Akquise-Tracker übernommen.' }],
      });
    });
  }

  function memoryStorage() {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } };
  }

  function createStore(opts = {}) {
    let storage = opts.storage || null;
    let persistent = !!storage;
    if (!storage) {
      try { storage = localStorage; storage.setItem('__kk_probe', '1'); storage.removeItem('__kk_probe'); persistent = true; }
      catch (e) { storage = memoryStorage(); persistent = false; }
    }
    const listeners = new Set();
    let state = defaultState();
    let lastError = null;

    const emit = (type, info) => listeners.forEach(fn => { try { fn(type, info); } catch (e) { console.error(e); } });

    function readFromStorage() {
      let raw = null;
      try { raw = storage.getItem(KEY); } catch (e) { raw = null; }
      if (raw) {
        try { return normalize(JSON.parse(raw)); } catch (e) { console.error('Gespeicherte Daten unlesbar', e); }
      }
      const s = defaultState();
      let legacy = null;
      try { legacy = storage.getItem(LEGACY_KEY); } catch (e) { /* ignore */ }
      if (legacy) {
        const contacts = migrateLegacy(legacy);
        if (contacts.length) { s.contacts = contacts; s.meta.legacyMigrated = true; }
      }
      return normalize(s);
    }

    function persist() {
      try {
        storage.setItem(KEY, JSON.stringify(state));
        lastError = null;
        return true;
      } catch (e) {
        lastError = e;
        emit('error', e);
        return false;
      }
    }

    const api = {
      get state() { return state; },
      get persistent() { return persistent; },
      get lastError() { return lastError; },
      on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      load() { state = readFromStorage(); if (state.meta.legacyMigrated && persistent) persist(); emit('load'); return state; },
      reload() { state = readFromStorage(); emit('load'); },
      // nach jeder Änderung aufrufen
      commit(reason) {
        state.meta.rev++;
        state.meta.changesSinceBackup++;
        const ok = persist();
        emit('change', reason);
        return ok;
      },
      exportData() {
        return JSON.stringify({ app: 'klarkontor', format: 1, exportedAt: new Date().toISOString(), state }, null, 1);
      },
      markBackup() {
        state.meta.lastBackupAt = U.today();
        state.meta.changesSinceBackup = 0;
        persist();
        emit('change', 'backup');
      },
      // mode: 'replace' | 'merge' (merge: vorhandene IDs bleiben, neue werden ergänzt)
      importData(text, mode = 'replace') {
        let data;
        try { data = JSON.parse(text); } catch (e) { return { ok: false, error: 'Die Datei ist keine gültige JSON-Datei.' }; }
        const incoming = data && data.app === 'klarkontor' && isObj(data.state) ? data.state : null;
        if (!incoming) return { ok: false, error: 'Das ist keine Klarkontor-Sicherung.' };
        if (incoming.version > VERSION) return { ok: false, error: 'Die Sicherung stammt aus einer neueren Version von Klarkontor.' };
        const inc = normalize(incoming);
        if (mode === 'replace') {
          state = inc;
          state.meta.changesSinceBackup = 0;
        } else {
          const cIds = new Set(state.contacts.map(c => c.id)), dIds = new Set(state.documents.map(d => d.id));
          const newC = inc.contacts.filter(c => !cIds.has(c.id)), newD = inc.documents.filter(d => !dIds.has(d.id));
          state.contacts.push(...newC);
          state.documents.push(...newD);
          for (const t of ['invoice', 'quote']) {
            const a = state.settings.numbering[t].counters, b = inc.settings.numbering[t].counters;
            for (const k of Object.keys(b)) a[k] = Math.max(a[k] || 0, b[k] || 0);
          }
        }
        api.commit('import');
        return { ok: true, contacts: inc.contacts.length, documents: inc.documents.length };
      },
      reset() { state = defaultState(); api.commit('reset'); },
      wipeStorage() { try { storage.removeItem(KEY); } catch (e) { /* ignore */ } state = defaultState(); emit('load'); },
    };
    return api;
  }

  return { KEY, LEGACY_KEY, VERSION, STAGES, OPEN_STAGES, DEFAULT_TEXTS, defaultState, normalize, normContact, normDoc, migrateLegacy, memoryStorage, createStore };
});
