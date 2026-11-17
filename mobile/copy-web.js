// Copie la version web de M-Alert (../web) dans www/, le dossier que Capacitor embarque.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'web');
const dst = path.join(__dirname, 'www');
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true, filter: (p) => !p.includes(`${path.sep}obs`) });
// Pont natif (application mobile) chargé avant app.js.
const html = path.join(dst, 'index.html');
// Application : pas de zoom (un toucher ne doit jamais agrandir la page), page sous l'encoche et la
// Dynamic Island (les marges de la zone sûre sont dans style.css).
const VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover">';
let page = fs.readFileSync(html, 'utf8').replace(/<meta name="viewport"[^>]*>/, VIEWPORT);
// mobile.js avant i18n.js (langue) et app.js.
page = page.replace('<script src="js/i18n.js"></script>', '<script src="js/mobile.js"></script>\n  <script src="js/i18n.js"></script>');
if (!page.includes('js/mobile.js')) throw new Error('index.html : emplacement de mobile.js introuvable');
fs.writeFileSync(html, page);
// Version de l'application (mises à jour) : celle de M-Alert (package.json), ou MALERT_VERSION.
const version = String(process.env.MALERT_VERSION || require('../package.json').version).replace(/^v/, '');
fs.writeFileSync(path.join(dst, 'js', 'mobile.js'), fs.readFileSync(path.join(__dirname, 'mobile.js'), 'utf8').replace('__MALERT_VERSION__', version));
console.log('web -> www copié');
