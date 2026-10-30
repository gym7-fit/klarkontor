/* Klarkontor – Beispieldaten (für Ausprobieren und Tests). Läuft über die echte Fachlogik, damit Nummern/Status konsistent sind. */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const U = isNode ? require('./util.js') : root.KK.util;
  const S = isNode ? require('./store.js') : root.KK.store;
  const D = isNode ? require('./domain.js') : root.KK.domain;
  const api = factory(U, S, D);
  root.KK = root.KK || {};
  root.KK.demo = api;
  if (isNode) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function (U, S, D) {
  'use strict';

  function fill(st, opts = {}) {
    const today = opts.today || U.today();
    const off = n => U.addDays(today, n);
    const klein = opts.klein !== false;
    const fresh = S.defaultState();
    Object.assign(st.state, fresh);
    const set = st.state.settings;
    Object.assign(set.company, {
      name: 'Muster Webdesign', owner: 'Maria Muster', street: 'Beispielweg 12', zip: '10115', city: 'Berlin',
      email: 'maria@muster-webdesign.example', phone: '030 1234567', website: 'muster-webdesign.example',
      taxNo: '12/345/67890', iban: 'DE89370400440532013000', bic: 'COBADEFFXXX', bankName: 'Commerzbank',
    });
    set.tax.kleinunternehmer = klein;
    set.dunning.baseRate = 2.27;
    st.state.meta.demo = true;

    const mkContact = (name, extra) => D.createContact(st, Object.assign({
      name, street: 'Musterstraße ' + (1 + name.length % 40), zip: '10' + String(100 + name.length * 7).slice(0, 3), city: 'Berlin',
      email: name.toLowerCase().replace(/[^a-z]+/g, '') + '@beispiel.example', phone: '030 55' + String(name.length * 913).slice(0, 5),
    }, extra));

    const huber = mkContact('Schreinerei Huber GmbH', { person: 'Thomas Huber', salutation: 'Sehr geehrter Herr Huber', status: 'Kunde', value: 450000, source: 'Empfehlung', notes: 'Langjähriger Kunde, Relaunch und laufende Wartung.' });
    const schmitt = mkContact('Familie Schmitt', { person: 'Julia Schmitt', salutation: 'Sehr geehrte Frau Schmitt', isBusiness: false, status: 'Kunde', value: 60000, source: 'Instagram' });
    const cafe = mkContact('Café Sonnenschein', { person: 'Lena Roth', salutation: 'Sehr geehrte Frau Roth', status: 'Angebot', value: 280000, followup: off(2), source: 'Messe', notes: 'Möchte Website mit Online-Reservierung.' });
    const brandt = mkContact('Elektro Brandt', { person: 'Jens Brandt', salutation: 'Sehr geehrter Herr Brandt', status: 'Angebot', value: 190000, followup: off(-2), source: 'Google' });
    mkContact('Yogastudio Lotus', { person: 'Mira Kaur', salutation: 'Sehr geehrte Frau Kaur', status: 'Termin', value: 150000, followup: off(3), notes: 'Kennenlerngespräch vereinbart.' });
    mkContact('Zahnarztpraxis Dr. Weber', { person: 'Dr. Anna Weber', salutation: 'Sehr geehrte Frau Dr. Weber', status: 'Antwort', value: 320000, followup: off(-3), notes: 'Hat Interesse an neuem Webauftritt signalisiert.' });
    mkContact('Fahrradladen Speiche', { person: 'Tom Lenz', status: 'Angeschrieben', value: 120000, followup: off(-1) });
    mkContact('Steuerbüro Lindner', { status: 'Neu', value: 200000 });
    mkContact('Gärtnerei Grünwald', { status: 'Neu', value: 90000, followup: off(5) });
    mkContact('Bäckerei Krüger', { status: 'Abgesagt', value: 80000, notes: 'Aktuell kein Budget.' });

    const item = (desc, qty, unit, price, vat = 19) => ({ id: U.uid('i'), desc, qty, unit, price, vat: klein ? 0 : vat });
    // chronologisch anlegen, damit Nummern lückenlos aufsteigen
    function invoice(contact, date, items, o = {}) {
      const d = D.createDocument(st, 'invoice', { contactId: contact.id });
      D.updateDocument(st, d.id, { date, due: U.addDays(date, 14), serviceDate: date, items, title: o.title || '', reference: o.reference || '', discount: o.discount || null });
      D.finalizeDocument(st, d.id);
      d.finalizedAt = date + 'T09:00:00.000Z';
      if (o.paid) D.markPaid(st, d.id, U.addDays(date, o.paid));
      return d;
    }
    const w1 = [item('Wartung & Updates\nMonat Frühling', 1, 'monat', 4500)];
    invoice(huber, off(-230), w1, { paid: 9 });
    const w2 = [item('Logo-Überarbeitung', 1, 'psch', 38000), item('Visitenkarten-Layout', 1, 'psch', 12000)];
    invoice(schmitt, off(-190), w2, { paid: 5 });
    const w3 = [item('Website-Relaunch\nKonzept, Design und Umsetzung (inkl. 3 Unterseiten)', 1, 'psch', 240000), item('Fotos & Bildbearbeitung', 6, 'std', 6500), item('Hosting-Einrichtung', 1, 'psch', 9000)];
    invoice(huber, off(-120), w3, { paid: 12, title: 'Website-Relaunch', discount: { mode: 'percent', value: 500 } });
    const w4 = [item('Fotoshooting Familienporträts', 1, 'psch', 45000)];
    invoice(schmitt, off(-75), w4, { paid: 4 });
    const w5 = [item('Wartung & Updates\nMonat Sommer', 3, 'monat', 4500), item('Kleine Anpassungen', 2.5, 'std', 6500)];
    invoice(huber, off(-40), w5, { title: 'Wartung Sommer' });                     // überfällig
    const w6 = [item('Social-Media-Grafiken (10 Stück)', 10, 'stk', 2800), item('Beratung', 1.5, 'std', 7500)];
    const partial = invoice(schmitt, off(-8), w6, {});                              // Teilzahlung
    D.addPayment(st, partial.id, { date: off(-3), amount: 20000, note: 'Anzahlung' });

    function quote(contact, date, items, status) {
      const q = D.createDocument(st, 'quote', { contactId: contact.id });
      D.updateDocument(st, q.id, { date, due: U.addDays(date, 14), items, title: 'Angebot Webauftritt' });
      D.finalizeDocument(st, q.id);
      q.finalizedAt = date + 'T09:00:00.000Z';
      if (status) D.setQuoteStatus(st, q.id, status);
      return q;
    }
    quote(huber, off(-130), [item('Website-Relaunch', 1, 'psch', 240000)], 'accepted');
    quote(cafe, off(-9), [item('Webauftritt mit Online-Reservierung', 1, 'psch', 220000), item('Fotos & Texte', 8, 'std', 7500)]);
    quote(brandt, off(-4), [item('Landingpage "Notdienst"', 1, 'psch', 150000), item('Google-Unternehmensprofil', 1, 'psch', 25000)]);

    const draft = D.createDocument(st, 'invoice', { contactId: huber.id });
    D.updateDocument(st, draft.id, { items: [item('Hosting 12 Monate', 12, 'monat', 1200)], title: 'Hosting' });
    st.state.meta.welcomeDismissed = true;
    st.commit('demo');
    return st.state;
  }

  return { fill };
});
