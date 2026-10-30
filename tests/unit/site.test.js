const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');

test('Service Worker: alle gecachten Dateien existieren, alle App-Skripte sind enthalten', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const list = JSON.parse(sw.match(/const ASSETS = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  for (const f of list) assert.ok(fs.existsSync(path.join(ROOT, f)), 'fehlt: ' + f);
  const app = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
  for (const m of app.matchAll(/(?:src|href)="([^"#:]+\.(?:js|css|png|svg|webmanifest))"/g)) assert.ok(list.includes(m[1]), 'nicht im Cache: ' + m[1]);
});

test('Keine externen Ressourcen und keine Inline-Skripte/-Styles in den Seiten', () => {
  for (const f of ['index.html', 'app.html', 'impressum.html', 'datenschutz.html']) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!/(src|href)="https?:/.test(s), f + ': externe Ressource');
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(s), f + ': Inline-Skript');
    assert.ok(!/\son[a-z]+="/.test(s), f + ': Inline-Event-Handler');
    assert.match(s, /Content-Security-Policy/, f + ': CSP fehlt');
  }
  for (const f of fs.readdirSync(path.join(ROOT, 'css'))) assert.ok(!/@import\s+url\(['"]?https?:/.test(fs.readFileSync(path.join(ROOT, 'css', f), 'utf8')), f + ': externes @import');
});
