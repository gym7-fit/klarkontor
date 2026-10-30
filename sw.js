/* Klarkontor – Service Worker: App läuft nach dem ersten Laden offline. Bei Änderungen VERSION erhöhen. */
const VERSION = 'klarkontor-v2.1.0';
const ASSETS = [
  'index.html', 'app.html', 'impressum.html', 'datenschutz.html', 'manifest.webmanifest',
  'css/fonts.css', 'css/app.css', 'css/site.css',
  'js/theme.js', 'js/util.js', 'js/calc.js', 'js/store.js', 'js/domain.js', 'js/fontmetrics.js', 'js/epc.js', 'js/layout.js', 'js/svg.js',
  'js/pdf.js', 'js/docpdf.js', 'js/einvoice.js', 'js/export.js', 'js/demo.js', 'js/ui.js', 'js/app.js',
  'js/views/dashboard.js', 'js/views/contacts.js', 'js/views/documents.js', 'js/views/editor.js', 'js/views/settings.js', 'js/views/help.js',
  'vendor/qrcode.js',
  'img/icon.svg', 'img/icon-192.png', 'img/icon-512.png',
  'fonts/barlow-latin-400-normal.woff2', 'fonts/barlow-latin-500-normal.woff2', 'fonts/barlow-latin-600-normal.woff2', 'fonts/barlow-latin-700-normal.woff2',
  'fonts/barlow-condensed-latin-600-normal.woff2', 'fonts/barlow-condensed-latin-700-normal.woff2',
  'fonts/ibm-plex-mono-latin-400-normal.woff2', 'fonts/ibm-plex-mono-latin-500-normal.woff2',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// sofort aus dem Cache antworten, im Hintergrund aktualisieren (stale-while-revalidate)
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await net) || new Response('Offline', { status: 503, statusText: 'Offline' });
  }));
});
