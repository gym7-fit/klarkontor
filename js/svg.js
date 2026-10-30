/* Klarkontor – Live-Vorschau: rendert eine Layout-Seite (Zeichenbefehle in mm) als SVG. */
(function (root, factory) {
  const U = (typeof module === 'object' && module.exports) ? require('./util.js') : root.KK.util;
  const api = factory(U);
  root.KK = root.KK || {};
  root.KK.svg = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function (U) {
  'use strict';
  const FONT = { r: ['normal', 400], b: ['normal', 700], i: ['italic', 400] };
  const n = v => Math.round(v * 100) / 100;
  const pt2mm = 25.4 / 72;

  function pageSvg(page, layout) {
    const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" width="100%" role="img" aria-label="Seitenvorschau" font-family="Helvetica, Arial, 'Liberation Sans', sans-serif">`,
      `<rect width="${layout.width}" height="${layout.height}" fill="#fff"/>`];
    for (const op of page.ops) {
      if (op.t === 'text') {
        const [style, weight] = FONT[op.font] || FONT.r;
        const anchor = op.anchor === 'end' ? 'end' : op.anchor === 'middle' ? 'middle' : 'start';
        parts.push(`<text x="${n(op.x)}" y="${n(op.y)}" font-size="${n(op.size * pt2mm)}" font-style="${style}" font-weight="${weight}" fill="${op.color}" text-anchor="${anchor}" xml:space="preserve">${U.esc(op.s)}</text>`);
      } else if (op.t === 'line') {
        parts.push(`<line x1="${n(op.x1)}" y1="${n(op.y1)}" x2="${n(op.x2)}" y2="${n(op.y2)}" stroke="${op.color}" stroke-width="${op.w}"/>`);
      } else if (op.t === 'rect') {
        parts.push(`<rect x="${n(op.x)}" y="${n(op.y)}" width="${n(op.w)}" height="${n(op.h)}" fill="${op.fill || 'none'}"${op.stroke ? ` stroke="${op.stroke}" stroke-width="${op.lw || 0.2}"` : ''}/>`);
      } else if (op.t === 'img') {
        const im = layout.images[op.id];
        if (im) parts.push(`<image x="${n(op.x)}" y="${n(op.y)}" width="${n(op.w)}" height="${n(op.h)}" href="${U.esc(im.dataUrl)}" preserveAspectRatio="xMidYMid meet"/>`);
      } else if (op.t === 'qr') {
        const k = op.m.length, cell = op.size / k;
        let d = '';
        for (let r = 0; r < k; r++) {
          let c = 0;
          while (c < k) {
            if (!op.m[r][c]) { c++; continue; }
            let e = c; while (e < k && op.m[r][e]) e++;
            d += `M${n(op.x + c * cell)} ${n(op.y + r * cell)}h${n((e - c) * cell)}v${n(cell)}h${-n((e - c) * cell)}z`;
            c = e;
          }
        }
        parts.push(`<path d="${d}" fill="#000"/>`);
      }
    }
    parts.push('</svg>');
    return parts.join('');
  }
  return { pageSvg };
});
