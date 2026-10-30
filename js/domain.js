/* Klarkontor – Fachlogik: Kontakte, Belege, Festschreiben, Storno, Zahlungen, Prüfungen. */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const U = isNode ? require('./util.js') : root.KK.util;
  const C = isNode ? require('./calc.js') : root.KK.calc;
  const S = isNode ? require('./store.js') : root.KK.store;
  const api = factory(U, C, S);
  root.KK = root.KK || {};
  root.KK.domain = api;
  if (isNode) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function (U, C, S) {
  'use strict';

  const byId = (list, id) => list.find(x => x.id === id) || null;
  const fail = msg => { throw new Error(msg); };

  /* ---------- Kontakte ---------- */
  function addLog(contact, type, text, date) {
    contact.log.unshift({ id: U.uid('l'), date: date || U.today(), type, text });
  }
  function createContact(st, data = {}) {
    const c = S.normContact(Object.assign({ createdAt: U.today() }, data));
    if (!c.log.length) addLog(c, 'note', 'Kontakt angelegt.');
    st.state.contacts.unshift(c);
    st.commit('contact:create');
    return c;
  }
  function updateContact(st, id, patch) {
    const c = byId(st.state.contacts, id) || fail('Kontakt nicht gefunden.');
    if (patch.status && patch.status !== c.status) addLog(c, 'status', `Status: ${c.status} → ${patch.status}`);
    Object.assign(c, patch);
    c.value = Math.round(Number(c.value) || 0);
    st.commit('contact:update');
    return c;
  }
  function deleteContact(st, id) {
    st.state.contacts = st.state.contacts.filter(c => c.id !== id);
    st.commit('contact:delete');
  }
  function contactClient(c) {
    return {
      name: c.name, person: c.person, salutation: c.salutation, street: c.street, zip: c.zip, city: c.city,
      country: c.country || 'DE', email: c.email, vatId: c.vatId, buyerRef: c.buyerRef, isBusiness: c.isBusiness !== false,
    };
  }

  /* ---------- Belege ---------- */
  function blankItem(st) {
    return { id: U.uid('i'), desc: '', qty: 1, unit: 'stk', price: 0, vat: 19 };
  }

  function createDocument(st, type, opts = {}) {
    const set = st.state.settings;
    const date = U.today();
    const d = S.normDoc({
      type, date, createdAt: date, klein: !!set.tax.kleinunternehmer,
      intro: type === 'quote' ? set.defaults.quoteIntro : set.defaults.invoiceIntro,
      closing: type === 'quote' ? set.defaults.quoteClosing : set.defaults.invoiceClosing,
      due: U.addDays(date, type === 'quote' ? set.defaults.quoteValidDays : set.defaults.paymentDays),
      items: [blankItem(st)],
    });
    if (opts.contactId) {
      const c = byId(st.state.contacts, opts.contactId);
      if (c) { d.contactId = c.id; d.client = Object.assign(d.client, contactClient(c)); }
    }
    st.state.documents.unshift(d);
    st.commit('doc:create');
    return d;
  }

  const LOCKED_OK = new Set(['notes', 'sentAt', 'einvoice']);
  function updateDocument(st, id, patch) {
    const d = byId(st.state.documents, id) || fail('Beleg nicht gefunden.');
    if (d.status !== 'draft') {
      for (const k of Object.keys(patch)) if (!LOCKED_OK.has(k)) fail('Festgeschriebene Belege können nicht mehr geändert werden. Nutze „Duplizieren“ oder „Stornieren“.');
    }
    Object.assign(d, patch);
    st.commit('doc:update');
    return d;
  }

  function deleteDocument(st, id) {
    const d = byId(st.state.documents, id) || fail('Beleg nicht gefunden.');
    if (d.status !== 'draft') fail('Nur Entwürfe können gelöscht werden. Festgeschriebene Belege müssen aufbewahrt werden.');
    const q = d.quoteId && byId(st.state.documents, d.quoteId);
    if (q && q.invoiceId === d.id) q.invoiceId = null; // Angebot kann erneut umgewandelt werden
    st.state.documents = st.state.documents.filter(x => x.id !== id);
    st.commit('doc:delete');
  }

  // Vorab-Prüfung vor dem Festschreiben (Pflichtangaben nach § 14 UStG, soweit hier abbildbar)
  function validateForFinalize(st, d) {
    const errors = [], warnings = [];
    const co = st.state.settings.company;
    const inv = d.type === 'invoice';
    if (!co.name.trim()) errors.push('Firmenname fehlt (Einstellungen → Unternehmen).');
    if (inv) {
      if (!co.street.trim() || !co.zip.trim() || !co.city.trim()) errors.push('Vollständige Anschrift des Unternehmens fehlt (Einstellungen → Unternehmen).');
      if (!co.taxNo.trim() && !co.vatId.trim()) errors.push('Steuernummer oder USt-IdNr. fehlt (Einstellungen → Unternehmen).');
    }
    if (!d.client.name.trim()) errors.push('Empfänger (Name/Firma) fehlt.');
    if (inv && (!d.client.street.trim() || !d.client.zip.trim() || !d.client.city.trim())) errors.push('Anschrift des Empfängers fehlt (Straße, PLZ und Ort).');
    if (!d.items.length) errors.push('Mindestens eine Position wird benötigt.');
    d.items.forEach((it, i) => { if (!it.desc.trim()) errors.push(`Position ${i + 1}: Beschreibung fehlt.`); });
    if (!U.isIso(d.date)) errors.push('Belegdatum fehlt.');
    const c = C.compute(d);
    if (d.items.length && c.gross <= 0 && !C.isStorno(d)) errors.push('Der Gesamtbetrag muss größer als 0 sein.');
    if (d.due && d.date && d.due < d.date) errors.push(d.type === 'quote' ? '„Gültig bis“ liegt vor dem Belegdatum.' : '„Zahlbar bis“ liegt vor dem Rechnungsdatum.');
    if (inv && !C.isStorno(d)) {
      if (!d.serviceDate) warnings.push('Kein Leistungsdatum angegeben – es wird das Rechnungsdatum verwendet.');
      if (!co.iban.trim()) warnings.push('Keine IBAN hinterlegt – Kund:innen sehen keine Bankverbindung.');
      else if (!U.ibanValid(co.iban)) warnings.push('Die hinterlegte IBAN scheint ungültig zu sein.');
    }
    return { errors, warnings };
  }

  function finalizeDocument(st, id) {
    const d = byId(st.state.documents, id) || fail('Beleg nicht gefunden.');
    if (d.status !== 'draft') fail('Der Beleg ist bereits festgeschrieben.');
    const v = validateForFinalize(st, d);
    if (v.errors.length) fail(v.errors.join('\n'));
    const existing = new Set(st.state.documents.map(x => x.number).filter(Boolean));
    const seq = st.state.settings.numbering[d.type];
    d.number = C.takeNumber(seq, U.yearOf(d.date), existing);
    d.status = 'final';
    d.finalizedAt = new Date().toISOString();
    if (d.type === 'invoice' && !d.serviceDate) d.serviceDate = d.date;
    st.commit('doc:finalize');
    return d;
  }

  function duplicateDocument(st, id) {
    const o = byId(st.state.documents, id) || fail('Beleg nicht gefunden.');
    const set = st.state.settings;
    const date = U.today();
    const d = S.normDoc(Object.assign(JSON.parse(JSON.stringify(o)), {
      id: U.uid('d'), number: null, status: 'draft', date, createdAt: date, serviceDate: '', serviceEnd: '',
      due: U.addDays(date, o.type === 'quote' ? set.defaults.quoteValidDays : set.defaults.paymentDays),
      payments: [], dunnings: [], sentAt: '', quoteId: null, invoiceId: null, cancelsId: null, cancelledById: null, finalizedAt: '',
      klein: !!set.tax.kleinunternehmer,
    }));
    if (o.cancelsId) d.items = d.items.map(it => Object.assign(it, { qty: -it.qty }));
    d.items.forEach(it => { it.id = U.uid('i'); if (d.klein) it.vat = 0; else if (!it.vat) it.vat = 19; });
    st.state.documents.unshift(d);
    st.commit('doc:duplicate');
    return d;
  }

  function quoteToInvoice(st, quoteId) {
    const q = byId(st.state.documents, quoteId) || fail('Angebot nicht gefunden.');
    if (q.type !== 'quote' || q.status === 'draft') fail('Nur festgeschriebene Angebote können in eine Rechnung umgewandelt werden.');
    if (q.invoiceId && byId(st.state.documents, q.invoiceId)) fail('Zu diesem Angebot existiert bereits eine Rechnung.');
    const set = st.state.settings;
    const date = U.today();
    const d = S.normDoc({
      type: 'invoice', date, createdAt: date, contactId: q.contactId, client: JSON.parse(JSON.stringify(q.client)),
      klein: !!set.tax.kleinunternehmer, title: q.title, reference: `Angebot ${q.number}`,
      intro: set.defaults.invoiceIntro, closing: set.defaults.invoiceClosing,
      due: U.addDays(date, set.defaults.paymentDays), quoteId: q.id,
      discount: q.discount ? Object.assign({}, q.discount) : null,
      items: q.items.map(it => Object.assign({}, it, { id: U.uid('i'), vat: set.tax.kleinunternehmer ? 0 : (it.vat || 19) })),
    });
    st.state.documents.unshift(d);
    q.invoiceId = d.id;
    q.status = 'accepted';
    const c = q.contactId && byId(st.state.contacts, q.contactId);
    if (c) { if (c.status !== 'Kunde') updateContactQuiet(c, { status: 'Kunde' }, `Angebot ${q.number} angenommen`); }
    st.commit('doc:quote2invoice');
    return d;
  }
  function updateContactQuiet(c, patch, logText) {
    if (patch.status && patch.status !== c.status) addLog(c, 'status', `Status: ${c.status} → ${patch.status}${logText ? ' (' + logText + ')' : ''}`);
    Object.assign(c, patch);
  }

  function setQuoteStatus(st, id, status) {
    const d = byId(st.state.documents, id) || fail('Beleg nicht gefunden.');
    if (d.type !== 'quote' || d.status === 'draft') fail('Der Status kann nur bei festgeschriebenen Angeboten geändert werden.');
    if (!['final', 'accepted', 'declined'].includes(status)) fail('Ungültiger Status.');
    d.status = status;
    const c = d.contactId && byId(st.state.contacts, d.contactId);
    if (c && status === 'accepted' && c.status !== 'Kunde') updateContactQuiet(c, { status: 'Kunde' }, `Angebot ${d.number} angenommen`);
    if (c && status === 'declined' && c.status === 'Angebot') updateContactQuiet(c, { status: 'Abgesagt' }, `Angebot ${d.number} abgelehnt`);
    st.commit('doc:status');
  }

  function cancelInvoice(st, id) {
    const o = byId(st.state.documents, id) || fail('Beleg nicht gefunden.');
    if (o.type !== 'invoice' || o.status !== 'final' || o.cancelsId) fail('Diese Rechnung kann nicht storniert werden.');
    if (o.cancelledById) fail('Die Rechnung wurde bereits storniert.');
    const date = U.today();
    const s = S.normDoc({
      type: 'invoice', date, createdAt: date, contactId: o.contactId, client: JSON.parse(JSON.stringify(o.client)), klein: o.klein,
      title: o.title, cancelsId: o.id, reference: `Storno zu Rechnung ${o.number}`,
      intro: `hiermit storniere ich die Rechnung ${o.number} vom ${U.fmtDate(o.date)}.`,
      closing: 'Die ursprüngliche Rechnung ist damit gegenstandslos. Bereits geleistete Zahlungen werden erstattet bzw. verrechnet.',
      serviceDate: o.serviceDate || o.date, serviceEnd: o.serviceEnd, due: date,
      discount: o.discount ? { mode: o.discount.mode, value: o.discount.mode === 'amount' ? -o.discount.value : o.discount.value } : null,
      items: o.items.map(it => Object.assign({}, it, { id: U.uid('i'), qty: -it.qty })),
    });
    const existing = new Set(st.state.documents.map(x => x.number).filter(Boolean));
    s.number = C.takeNumber(st.state.settings.numbering.invoice, U.yearOf(date), existing);
    s.status = 'final';
    s.finalizedAt = new Date().toISOString();
    st.state.documents.unshift(s);
    o.status = 'cancelled';
    o.cancelledById = s.id;
    st.commit('doc:cancel');
    return s;
  }

  /* ---------- Zahlungen, Versand, Mahnungen ---------- */
  function addPayment(st, id, { date, amount, note }) {
    const d = byId(st.state.documents, id) || fail('Beleg nicht gefunden.');
    if (d.type !== 'invoice' || d.status !== 'final' || d.cancelsId) fail('Zahlungen können nur zu offenen Rechnungen erfasst werden.');
    if (!U.isIso(date)) fail('Bitte ein gültiges Zahlungsdatum angeben.');
    if (!amount || amount <= 0) fail('Bitte einen Betrag größer als 0 angeben.');
    d.payments.push({ id: U.uid('p'), date, amount: Math.round(amount), note: note || '' });
    st.commit('doc:payment');
    return d;
  }
  function removePayment(st, id, paymentId) {
    const d = byId(st.state.documents, id) || fail('Beleg nicht gefunden.');
    d.payments = d.payments.filter(p => p.id !== paymentId);
    st.commit('doc:payment');
  }
  function markPaid(st, id, date) {
    const d = byId(st.state.documents, id) || fail('Beleg nicht gefunden.');
    const open = C.compute(d).open;
    if (open > 0) addPayment(st, id, { date: date || U.today(), amount: open, note: 'Zahlung in voller Höhe' });
    return d;
  }
  function markSent(st, id, date) {
    const d = byId(st.state.documents, id) || fail('Beleg nicht gefunden.');
    d.sentAt = date || U.today();
    st.commit('doc:sent');
  }
  function addDunning(st, id, entry) {
    const d = byId(st.state.documents, id) || fail('Beleg nicht gefunden.');
    d.dunnings.push(Object.assign({ id: U.uid('m') }, entry));
    st.commit('doc:dunning');
  }
  const nextDunningLevel = d => Math.min(2, d.dunnings.length);

  /* ---------- Auswertungen ---------- */
  // Rechnungen, die in Umsatz/Forderungen zählen: festgeschrieben, kein Storno, nicht storniert
  const countsAsRevenue = d => d.type === 'invoice' && d.status === 'final' && !d.cancelsId;

  function receivables(state, today) {
    const open = state.documents.filter(C.isReceivable);
    const sum = list => list.reduce((s, d) => s + C.compute(d).open, 0);
    const overdue = open.filter(d => d.due && d.due < today);
    return { open, overdue, openSum: sum(open), overdueSum: sum(overdue) };
  }

  // Zahlungseingänge je Jahr (Ist) und Rechnungen je Rechnungsdatum (Soll), Netto/Brutto getrennt
  function revenueByYear(state, year) {
    let paidGross = 0, paidNet = 0, billedNet = 0, billedGross = 0, openGross = 0;
    for (const d of state.documents.filter(countsAsRevenue)) {
      if (d.status === 'cancelled') continue;
      const c = C.compute(d);
      if (U.yearOf(d.date) === year) { billedNet += c.net; billedGross += c.gross; }
      for (const p of d.payments) {
        if (U.yearOf(p.date) !== year) continue;
        paidGross += p.amount;
        paidNet += c.gross ? Math.round(p.amount * c.net / c.gross) : 0;
      }
      if (U.yearOf(d.date) === year && c.open > 0) openGross += c.open;
    }
    return { paidGross, paidNet, billedNet, billedGross, openGross };
  }

  function monthlyRevenue(state, year) {
    const m = Array(12).fill(0);
    for (const d of state.documents.filter(countsAsRevenue)) {
      const c = C.compute(d);
      if (!c.gross) continue;
      for (const p of d.payments) {
        if (U.yearOf(p.date) === year) m[+p.date.slice(5, 7) - 1] += Math.round(p.amount * c.net / c.gross);
      }
    }
    return m;
  }

  function followUps(state, today) {
    return state.contacts.filter(c => S.OPEN_STAGES.includes(c.status) && c.followup && c.followup <= today)
      .sort((a, b) => a.followup.localeCompare(b.followup));
  }

  // fällige Aufgaben für das Dashboard
  function todos(state, today) {
    const list = [];
    for (const d of state.documents.filter(C.isReceivable)) {
      const st = C.docState(d, today);
      if (st.key === 'overdue') list.push({ kind: 'overdue', prio: 1, doc: d, text: `${C.docTitle(d)} – ${st.label}`, sub: `${d.client.name} · offen ${U.eur(C.compute(d).open)}` });
    }
    for (const c of followUps(state, today)) list.push({ kind: 'followup', prio: 2, contact: c, text: `Nachfassen: ${c.name}`, sub: `fällig seit ${U.fmtDate(c.followup)}` });
    for (const d of state.documents) {
      if (d.type === 'quote' && d.status === 'final' && d.finalizedAt) {
        const age = U.daysBetween(d.finalizedAt.slice(0, 10), today);
        const st = C.docState(d, today);
        if (st.key === 'open' && age >= 7) list.push({ kind: 'quote', prio: 3, doc: d, text: `${C.docTitle(d)} ohne Antwort`, sub: `${d.client.name} · seit ${age} Tagen offen` });
      }
      if (d.status === 'draft') list.push({ kind: 'draft', prio: 4, doc: d, text: `Entwurf: ${C.typeLabel(d)} an ${d.client.name || 'unbekannt'}`, sub: `angelegt am ${U.fmtDate(d.createdAt)}` });
    }
    return list.sort((a, b) => a.prio - b.prio);
  }

  return {
    byId, addLog, createContact, updateContact, deleteContact, contactClient,
    createDocument, updateDocument, deleteDocument, validateForFinalize, finalizeDocument, duplicateDocument,
    quoteToInvoice, setQuoteStatus, cancelInvoice, addPayment, removePayment, markPaid, markSent, addDunning, nextDunningLevel,
    countsAsRevenue, receivables, revenueByYear, monthlyRevenue, followUps, todos, blankItem,
  };
});
