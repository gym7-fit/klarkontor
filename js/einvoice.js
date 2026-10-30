/* Klarkontor – E-Rechnung: UN/CEFACT CII (EN 16931). Profile: XRechnung 3.0 (reines XML) und ZUGFeRD/Factur-X EN 16931 (XML für das PDF). */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const U = isNode ? require('./util.js') : root.KK.util;
  const C = isNode ? require('./calc.js') : root.KK.calc;
  const api = factory(U, C);
  root.KK = root.KK || {};
  root.KK.einvoice = api;
  if (isNode) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function (U, C) {
  'use strict';

  const PROFILES = {
    xrechnung: {
      id: 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0',
      process: 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
      name: 'XRechnung 3.0', file: 'xrechnung.xml',
    },
    zugferd: { id: 'urn:cen.eu:en16931:2017', process: null, name: 'ZUGFeRD / Factur-X (EN 16931)', file: 'factur-x.xml' },
  };
  const KLEIN_REASON = 'Kleinunternehmer gemäß § 19 UStG – keine Umsatzsteuer ausgewiesen';

  // XML-Text: Steuerzeichen entfernen, Sonderzeichen escapen
  const x = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const d8 = iso => iso.replace(/-/g, '');
  const dec = c => U.decimal(c);
  const qty = n => String(Math.round(Math.abs(n) * 10000) / 10000);
  const el = (name, content, attrs) => {
    const a = attrs ? Object.entries(attrs).map(([k, v]) => ` ${k}="${x(v)}"`).join('') : '';
    return content === '' || content == null ? '' : `<${name}${a}>${content}</${name}>`;
  };
  const date = (name, iso, ns = 'udt') => `<${name}><${ns}:DateTimeString format="102">${d8(iso)}</${ns}:DateTimeString></${name}>`;

  // E-Mail und Käuferreferenz dürfen auch nach dem Festschreiben für die E-Rechnung ergänzt werden (ohne den gedruckten Beleg zu ändern)
  function effective(doc) {
    const o = doc.einvoice || {};
    return Object.assign({}, doc, { client: Object.assign({}, doc.client, { email: (o.email || doc.client.email || '').trim(), buyerRef: (o.buyerRef || doc.client.buyerRef || '').trim() }) });
  }

  // Storno-Belege (negative Mengen) werden als Gutschrift (381) mit positiven Beträgen ausgegeben
  function positiveTwin(doc) {
    if (!C.isStorno(doc)) return doc;
    return Object.assign({}, doc, {
      items: doc.items.map(it => Object.assign({}, it, { qty: -it.qty })),
      discount: doc.discount ? { mode: doc.discount.mode, value: doc.discount.mode === 'amount' ? -doc.discount.value : doc.discount.value } : null,
    });
  }

  // Vorab-Prüfung: Pflichtangaben für das gewählte Profil
  function check(docIn, settings, profile = 'xrechnung', original = null) {
    const errors = [], warnings = [];
    const doc = effective(docIn);
    const co = settings.company, cl = doc.client;
    const need = (v, msg) => { if (!String(v || '').trim()) errors.push(msg); };
    if (doc.type !== 'invoice') errors.push('Nur Rechnungen können als E-Rechnung ausgegeben werden.');
    if (doc.status === 'draft' || !doc.number) errors.push('Die Rechnung muss zuerst festgeschrieben werden (Nummer fehlt).');
    need(co.name, 'Firmenname fehlt (Einstellungen).');
    need(co.street, 'Straße des Unternehmens fehlt (Einstellungen).');
    need(co.zip, 'PLZ des Unternehmens fehlt (Einstellungen).');
    need(co.city, 'Ort des Unternehmens fehlt (Einstellungen).');
    if (!co.taxNo.trim() && !co.vatId.trim()) errors.push('Steuernummer oder USt-IdNr. fehlt (Einstellungen).');
    if (!U.ibanValid(co.iban)) errors.push('Eine gültige IBAN wird für die Zahlungsangaben benötigt (Einstellungen).');
    need(cl.name, 'Name des Empfängers fehlt.');
    need(cl.street, 'Straße des Empfängers fehlt.');
    need(cl.zip, 'PLZ des Empfängers fehlt.');
    need(cl.city, 'Ort des Empfängers fehlt.');
    if (C.isStorno(doc) && !original) errors.push('Die ursprüngliche Rechnung wurde nicht gefunden.');
    if (profile === 'xrechnung') {
      if (!U.emailValid(co.email)) errors.push('XRechnung: E-Mail-Adresse des Unternehmens fehlt oder ist ungültig (Einstellungen).');
      need(co.phone, 'XRechnung: Telefonnummer des Unternehmens fehlt (Einstellungen).');
      if (!U.emailValid(cl.email)) errors.push('XRechnung: E-Mail-Adresse des Empfängers fehlt oder ist ungültig (elektronische Adresse).');
      if (!cl.buyerRef.trim()) warnings.push('Keine Käuferreferenz / Leitweg-ID angegeben – es wird die Rechnungsnummer eingetragen. Öffentliche Auftraggeber verlangen ihre Leitweg-ID.');
    }
    return { errors, warnings };
  }

  function party(p, withContact, seller, profile) {
    const addr = el('ram:PostalTradeAddress', el('ram:PostcodeCode', x(p.zip)) + el('ram:LineOne', x(p.street)) + el('ram:CityName', x(p.city)) + el('ram:CountryID', x(p.country || 'DE')));
    // BR-CO-26: ohne USt-IdNr. wird die Steuernummer zusätzlich als Verkäufer-Kennung (BT-29) geführt
    let s = (seller && !p.vatId && p.taxNo ? el('ram:ID', x(p.taxNo)) : '') + el('ram:Name', x(p.name));
    if (withContact) {
      s += el('ram:DefinedTradeContact',
        el('ram:PersonName', x(p.contactName)) +
        el('ram:TelephoneUniversalCommunication', el('ram:CompleteNumber', x(p.phone))) +
        el('ram:EmailURIUniversalCommunication', el('ram:URIID', x(p.email))));
    }
    s += addr;
    if (p.email && (profile === 'xrechnung' || seller)) s += el('ram:URIUniversalCommunication', el('ram:URIID', x(p.email), { schemeID: 'EM' }));
    if (p.vatId) s += el('ram:SpecifiedTaxRegistration', el('ram:ID', x(U.ibanNorm(p.vatId)), { schemeID: 'VA' }));
    if (p.taxNo) s += el('ram:SpecifiedTaxRegistration', el('ram:ID', x(p.taxNo), { schemeID: 'FC' }));
    return s;
  }

  function build(docIn, settings, { profile = 'xrechnung', original = null } = {}) {
    const prof = PROFILES[profile];
    docIn = effective(docIn);
    const doc = positiveTwin(docIn);
    const calc = C.compute(doc);
    const co = settings.company, cl = doc.client;
    const storno = C.isStorno(docIn);
    const klein = !!doc.klein;
    const serviceDate = doc.serviceDate || doc.date;

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">\n';
    xml += '<rsm:ExchangedDocumentContext>' +
      (prof.process ? el('ram:BusinessProcessSpecifiedDocumentContextParameter', el('ram:ID', prof.process)) : '') +
      el('ram:GuidelineSpecifiedDocumentContextParameter', el('ram:ID', prof.id)) + '</rsm:ExchangedDocumentContext>\n';
    xml += '<rsm:ExchangedDocument>' + el('ram:ID', x(docIn.number)) + el('ram:TypeCode', storno ? '381' : '380') + date('ram:IssueDateTime', doc.date);
    if (doc.title) xml += el('ram:IncludedNote', el('ram:Content', x(doc.title)));
    xml += '</rsm:ExchangedDocument>\n<rsm:SupplyChainTradeTransaction>\n';

    // Positionen
    doc.items.forEach((it, i) => {
      const ln = calc.lines[i];
      const [first, ...rest] = String(it.desc || '').split('\n');
      const descr = rest.join(' ').trim();
      xml += '<ram:IncludedSupplyChainTradeLineItem>' +
        el('ram:AssociatedDocumentLineDocument', el('ram:LineID', String(i + 1))) +
        el('ram:SpecifiedTradeProduct', el('ram:Name', x(first.trim() || '-')) + el('ram:Description', x(descr))) +
        el('ram:SpecifiedLineTradeAgreement', el('ram:NetPriceProductTradePrice', el('ram:ChargeAmount', dec(ln.price)))) +
        el('ram:SpecifiedLineTradeDelivery', el('ram:BilledQuantity', qty(it.qty), { unitCode: C.unitOf(it.unit).code })) +
        el('ram:SpecifiedLineTradeSettlement',
          el('ram:ApplicableTradeTax', el('ram:TypeCode', 'VAT') + el('ram:CategoryCode', ln.rate === 0 ? 'E' : 'S') + el('ram:RateApplicablePercent', String(ln.rate))) +
          el('ram:SpecifiedTradeSettlementLineMonetarySummation', el('ram:LineTotalAmount', dec(ln.net)))) +
        '</ram:IncludedSupplyChainTradeLineItem>\n';
    });

    // Vertrag / Parteien
    const seller = { name: co.name, zip: co.zip, street: co.street, city: co.city, country: co.country, email: co.email, phone: co.phone, contactName: co.owner || co.name, vatId: co.vatId, taxNo: co.taxNo };
    const buyer = { name: cl.name, zip: cl.zip, street: cl.street, city: cl.city, country: cl.country, email: cl.email, vatId: cl.vatId };
    xml += '<ram:ApplicableHeaderTradeAgreement>' +
      el('ram:BuyerReference', x(cl.buyerRef || docIn.number)) +
      el('ram:SellerTradeParty', party(seller, profile === 'xrechnung', true, profile)) +
      el('ram:BuyerTradeParty', party(buyer, false, false, profile)) +
      (doc.reference && !storno ? el('ram:BuyerOrderReferencedDocument', el('ram:IssuerAssignedID', x(doc.reference))) : '') +
      '</ram:ApplicableHeaderTradeAgreement>\n';
    xml += '<ram:ApplicableHeaderTradeDelivery>' +
      el('ram:ActualDeliverySupplyChainEvent', date('ram:OccurrenceDateTime', doc.serviceEnd || serviceDate)) +
      '</ram:ApplicableHeaderTradeDelivery>\n';

    // Abrechnung
    xml += '<ram:ApplicableHeaderTradeSettlement>' + el('ram:PaymentReference', x(docIn.number)) + el('ram:InvoiceCurrencyCode', 'EUR');
    xml += el('ram:SpecifiedTradeSettlementPaymentMeans',
      el('ram:TypeCode', '58') +
      el('ram:PayeePartyCreditorFinancialAccount', el('ram:IBANID', x(U.ibanNorm(co.iban)))) +
      (co.bic ? el('ram:PayeeSpecifiedCreditorFinancialInstitution', el('ram:BICID', x(U.ibanNorm(co.bic)))) : ''));
    for (const g of calc.groups) {
      xml += el('ram:ApplicableTradeTax',
        el('ram:CalculatedAmount', dec(g.vat)) + el('ram:TypeCode', 'VAT') +
        (g.cat === 'E' ? el('ram:ExemptionReason', x(klein ? KLEIN_REASON : 'Umsatzsteuerfrei')) : '') +
        el('ram:BasisAmount', dec(g.taxable)) + el('ram:CategoryCode', g.cat) + el('ram:RateApplicablePercent', String(g.rate)));
    }
    if (doc.serviceEnd && doc.serviceDate) {
      xml += el('ram:BillingSpecifiedPeriod', date('ram:StartDateTime', doc.serviceDate) + date('ram:EndDateTime', doc.serviceEnd));
    }
    for (const g of calc.groups) {
      if (!g.allowance) continue;
      xml += el('ram:SpecifiedTradeAllowanceCharge',
        '<ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator>' +
        el('ram:ActualAmount', dec(g.allowance)) + el('ram:Reason', 'Rabatt') +
        el('ram:CategoryTradeTax', el('ram:TypeCode', 'VAT') + el('ram:CategoryCode', g.cat) + el('ram:RateApplicablePercent', String(g.rate))));
    }
    xml += el('ram:SpecifiedTradePaymentTerms',
      el('ram:Description', x(doc.due ? `Zahlbar bis ${U.fmtDate(doc.due)} ohne Abzug.` : '')) + (doc.due ? date('ram:DueDateDateTime', doc.due) : ''));
    xml += el('ram:SpecifiedTradeSettlementHeaderMonetarySummation',
      el('ram:LineTotalAmount', dec(calc.lineTotal)) +
      (calc.allowanceTotal ? el('ram:AllowanceTotalAmount', dec(calc.allowanceTotal)) : '') +
      el('ram:TaxBasisTotalAmount', dec(calc.net)) +
      el('ram:TaxTotalAmount', dec(calc.vat), { currencyID: 'EUR' }) +
      el('ram:GrandTotalAmount', dec(calc.gross)) +
      el('ram:DuePayableAmount', dec(calc.gross)));
    if (storno && original) {
      xml += el('ram:InvoiceReferencedDocument', el('ram:IssuerAssignedID', x(original.number)) + date('ram:FormattedIssueDateTime', original.date, 'qdt'));
    }
    xml += '</ram:ApplicableHeaderTradeSettlement>\n</rsm:SupplyChainTradeTransaction>\n</rsm:CrossIndustryInvoice>\n';
    return xml;
  }

  return { PROFILES, KLEIN_REASON, check, build, positiveTwin, effective };
});
