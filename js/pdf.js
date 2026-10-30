/* Klarkontor – minimaler PDF-Writer ohne Abhängigkeiten.
   Eingabe: Layout (Seiten mit Zeichenbefehlen in mm, Ursprung oben links). Ausgabe: PDF-Bytes.
   Standardschriften (Helvetica), JPEG-Bilder, Vektor-QR, optionale Dateianhänge (z. B. ZUGFeRD-XML) und XMP. */
(function (root, factory) {
  const FM = (typeof module === 'object' && module.exports) ? require('./fontmetrics.js') : root.KK.fontmetrics;
  const api = factory(FM);
  root.KK = root.KK || {};
  root.KK.pdf = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function (FM) {
  'use strict';

  const PT = 72 / 25.4;
  const num = n => { const r = Math.round(n * 1000) / 1000; return Object.is(r, -0) ? '0' : String(r); };
  const FONTS = { r: ['F1', 'Helvetica'], b: ['F2', 'Helvetica-Bold'], i: ['F3', 'Helvetica-Oblique'] };

  const enc = new TextEncoder();
  const ascii = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
  const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const textString = s => { // UTF-16BE mit BOM als Hex-String
    let h = 'FEFF';
    for (let i = 0; i < s.length; i++) h += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
    return '<' + h + '>';
  };
  const pdfDate = d => 'D:' + d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0') +
    String(d.getUTCHours()).padStart(2, '0') + String(d.getUTCMinutes()).padStart(2, '0') + String(d.getUTCSeconds()).padStart(2, '0') + 'Z';
  const nameEsc = s => s.replace(/[^A-Za-z0-9._-]/g, c => '#' + c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase());

  function concat(chunks) {
    let n = 0; for (const c of chunks) n += c.length;
    const out = new Uint8Array(n); let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  function color(c, fallback) {
    if (!c) c = fallback;
    if (typeof c === 'string') {
      const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
      if (m) return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
      return [0, 0, 0];
    }
    return c;
  }
  const rgb = (c, op, fb) => color(c, fb).map(v => num(v)).join(' ') + ' ' + op;

  /* ---------- JPEG ---------- */
  function parseJpeg(bytes) {
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) throw new Error('Kein JPEG');
    let i = 2;
    while (i < bytes.length) {
      if (bytes[i] !== 0xFF) { i++; continue; }
      const m = bytes[i + 1];
      if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
        return { h: (bytes[i + 5] << 8) | bytes[i + 6], w: (bytes[i + 7] << 8) | bytes[i + 8], comps: bytes[i + 9], progressive: m === 0xC2 };
      }
      i += 2 + len;
    }
    throw new Error('JPEG-Größe nicht lesbar');
  }
  function dataUrlToBytes(url) {
    const m = /^data:([^;,]+);base64,(.*)$/s.exec(url || '');
    if (!m) throw new Error('Ungültige Daten-URL');
    if (typeof atob === 'function') { const bin = atob(m[2]); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
    return new Uint8Array(Buffer.from(m[2], 'base64'));
  }

  /* ---------- Seiteninhalt ---------- */
  function pageContent(page, H, imgNames) {
    const out = [];
    const Y = y => num(H * PT - y * PT);
    for (const op of page.ops) {
      if (op.t === 'text') {
        if (!op.s) continue;
        const [fname] = FONTS[op.font] || FONTS.r;
        let x = op.x;
        const w = FM.width(op.s, op.font || 'r', op.size);
        if (op.anchor === 'end') x -= w; else if (op.anchor === 'middle') x -= w / 2;
        out.push(`BT /${fname} ${num(op.size)} Tf ${rgb(op.color, 'rg', [0, 0, 0])} ${num(x * PT)} ${Y(op.y)} Td <${hex(FM.toBytes(op.s))}> Tj ET`);
      } else if (op.t === 'line') {
        out.push(`q ${num((op.w || 0.2) * PT)} w ${rgb(op.color, 'RG', [0, 0, 0])} ${num(op.x1 * PT)} ${Y(op.y1)} m ${num(op.x2 * PT)} ${Y(op.y2)} l S Q`);
      } else if (op.t === 'rect') {
        const parts = ['q'];
        if (op.fill) parts.push(rgb(op.fill, 'rg'));
        if (op.stroke) { parts.push(rgb(op.stroke, 'RG')); parts.push(`${num((op.lw || 0.2) * PT)} w`); }
        parts.push(`${num(op.x * PT)} ${Y(op.y + op.h)} ${num(op.w * PT)} ${num(op.h * PT)} re ${op.fill && op.stroke ? 'B' : op.fill ? 'f' : 'S'} Q`);
        out.push(parts.join(' '));
      } else if (op.t === 'img') {
        const name = imgNames[op.id];
        if (name) out.push(`q ${num(op.w * PT)} 0 0 ${num(op.h * PT)} ${num(op.x * PT)} ${Y(op.y + op.h)} cm /${name} Do Q`);
      } else if (op.t === 'qr') {
        const n = op.m.length, cell = op.size / n;
        const parts = ['q', rgb(op.color || [0, 0, 0], 'rg')];
        for (let r = 0; r < n; r++) {
          let c = 0;
          while (c < n) {
            if (!op.m[r][c]) { c++; continue; }
            let e = c; while (e < n && op.m[r][e]) e++;
            parts.push(`${num((op.x + c * cell) * PT)} ${Y(op.y + (r + 1) * cell)} ${num((e - c) * cell * PT)} ${num(cell * PT)} re`);
            c = e;
          }
        }
        parts.push('f Q');
        out.push(parts.join(' '));
      }
    }
    return ascii(out.join('\n'));
  }

  /* ---------- Dokument ---------- */
  function render(layout, opts = {}) {
    const W = layout.width, H = layout.height;
    const now = opts.date || new Date();
    const objs = [];
    const reserve = () => { objs.push(null); return objs.length; };
    const set = (id, content) => { objs[id - 1] = content; };
    const add = content => { const id = reserve(); set(id, content); return id; };
    const stream = (dict, data) => concat([ascii(`<< ${dict} /Length ${data.length} >>\nstream\n`), data, ascii('\nendstream')]);

    const catalogId = reserve(), pagesId = reserve();
    const fontIds = {};
    for (const k of Object.keys(FONTS)) {
      fontIds[FONTS[k][0]] = add(ascii(`<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS[k][1]} /Encoding /WinAnsiEncoding >>`));
    }

    const imgNames = {}, imgRefs = [];
    let ni = 0;
    for (const [id, im] of Object.entries(opts.images || {})) {
      const info = parseJpeg(im.bytes);
      const cs = info.comps === 1 ? '/DeviceGray' : info.comps === 4 ? '/DeviceCMYK' : '/DeviceRGB';
      const oid = add(stream(`/Type /XObject /Subtype /Image /Width ${info.w} /Height ${info.h} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode${info.comps === 4 ? ' /Decode [1 0 1 0 1 0 1 0]' : ''}`, im.bytes));
      imgNames[id] = 'Im' + (++ni);
      imgRefs.push(`/${imgNames[id]} ${oid} 0 R`);
    }
    const resources = `<< /Font << ${Object.entries(fontIds).map(([n, i]) => `/${n} ${i} 0 R`).join(' ')} >>${imgRefs.length ? ` /XObject << ${imgRefs.join(' ')} >>` : ''} >>`;

    const pageIds = [];
    for (const page of layout.pages) {
      const cId = add(stream('', pageContent(page, H, imgNames)));
      pageIds.push(add(ascii(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(W * PT)} ${num(H * PT)}] /Resources ${resources} /Contents ${cId} 0 R >>`)));
    }
    set(pagesId, ascii(`<< /Type /Pages /Kids [${pageIds.map(i => i + ' 0 R').join(' ')}] /Count ${pageIds.length} >>`));

    // Dateianhänge (z. B. factur-x.xml)
    const fileSpecs = [];
    for (const a of opts.attachments || []) {
      const ef = add(stream(`/Type /EmbeddedFile /Subtype /${nameEsc(a.mime || 'application/octet-stream')} /Params << /Size ${a.bytes.length} /ModDate (${pdfDate(now)}) >>`, a.bytes));
      const fs = add(ascii(`<< /Type /Filespec /F (${a.name}) /UF (${a.name}) /Desc ${textString(a.desc || a.name)} /AFRelationship /${a.relationship || 'Data'} /EF << /F ${ef} 0 R /UF ${ef} 0 R >> >>`));
      fileSpecs.push({ name: a.name, id: fs });
    }

    let metaId = null;
    if (opts.xmp) metaId = add(stream('/Type /Metadata /Subtype /XML', enc.encode(opts.xmp)));

    const info = add(ascii(`<< /Title ${textString(opts.title || '')} /Author ${textString(opts.author || '')} /Subject ${textString(opts.subject || '')} /Creator ${textString('Klarkontor')} /Producer ${textString('Klarkontor PDF')} /CreationDate (${pdfDate(now)}) /ModDate (${pdfDate(now)}) >>`));

    let cat = `<< /Type /Catalog /Pages ${pagesId} 0 R /Lang (de-DE) /ViewerPreferences << /DisplayDocTitle true >>`;
    if (metaId) cat += ` /Metadata ${metaId} 0 R`;
    if (fileSpecs.length) {
      cat += ` /Names << /EmbeddedFiles << /Names [${fileSpecs.map(f => `(${f.name}) ${f.id} 0 R`).join(' ')}] >> >>`;
      cat += ` /AF [${fileSpecs.map(f => f.id + ' 0 R').join(' ')}]`;
    }
    set(catalogId, ascii(cat + ' >>'));

    // Schreiben
    const chunks = [ascii('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n')];
    let pos = chunks[0].length;
    const offsets = [];
    objs.forEach((content, i) => {
      offsets.push(pos);
      const head = ascii(`${i + 1} 0 obj\n`), tail = ascii('\nendobj\n');
      chunks.push(head, content, tail);
      pos += head.length + content.length + tail.length;
    });
    let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) xref += String(o).padStart(10, '0') + ' 00000 n \n';
    const idHex = hex(enc.encode(String(now.getTime()) + (opts.title || ''))).slice(0, 32).padEnd(32, '0');
    xref += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R /Info ${info} 0 R /ID [<${idHex}> <${idHex}>] >>\nstartxref\n${pos}\n%%EOF\n`;
    chunks.push(ascii(xref));
    return concat(chunks);
  }

  // XMP-Metadaten für ein Factur-X/ZUGFeRD-Hybrid (ohne PDF/A-Kennzeichnung)
  function facturxXmp({ title, author, filename, conformance, date }) {
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const iso = (date || new Date()).toISOString();
    return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(title)}</rdf:li></rdf:Alt></dc:title><dc:creator><rdf:Seq><rdf:li>${esc(author)}</rdf:li></rdf:Seq></dc:creator></rdf:Description>
<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreatorTool>Klarkontor</xmp:CreatorTool><xmp:CreateDate>${iso}</xmp:CreateDate></rdf:Description>
<rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"><fx:DocumentType>INVOICE</fx:DocumentType><fx:DocumentFileName>${esc(filename)}</fx:DocumentFileName><fx:Version>1.0</fx:Version><fx:ConformanceLevel>${esc(conformance)}</fx:ConformanceLevel></rdf:Description>
</rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;
  }

  return { render, parseJpeg, dataUrlToBytes, facturxXmp, concat, ascii, PT };
});
