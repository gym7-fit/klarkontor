/* Klarkontor – Brücke: Layout -> PDF-Bytes (mit optionalem eingebettetem XML). */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const P = isNode ? require('./pdf.js') : root.KK.pdf;
  const api = factory(P);
  root.KK = root.KK || {};
  root.KK.docpdf = api;
  if (isNode) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function (P) {
  'use strict';

  function toPdf(layout, { author, subject, xml, xmlName, xmlConformance, date } = {}) {
    const images = {};
    for (const [id, im] of Object.entries(layout.images || {})) images[id] = { bytes: P.dataUrlToBytes(im.dataUrl) };
    const opts = { title: layout.title, author: author || '', subject: subject || '', images, date };
    if (xml) {
      const name = xmlName || 'factur-x.xml';
      opts.attachments = [{ name, mime: 'text/xml', bytes: new TextEncoder().encode(xml), desc: 'Strukturierte Rechnungsdaten (EN 16931)', relationship: 'Alternative' }];
      opts.xmp = P.facturxXmp({ title: layout.title, author: author || '', filename: name, conformance: xmlConformance || 'EN 16931', date });
    }
    return P.render(layout, opts);
  }
  return { toPdf };
});
