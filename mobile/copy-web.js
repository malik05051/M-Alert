// Copie la version web de M-Alert (../web) dans www/, le dossier que Capacitor embarque.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'web');
const dst = path.join(__dirname, 'www');
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true, filter: (p) => !p.includes(`${path.sep}obs`) });
// Pont natif (application mobile) chargé avant app.js.
const html = path.join(dst, 'index.html');
fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replace('<script src="js/app.js"></script>', '<script src="js/mobile.js"></script>\n  <script src="js/app.js"></script>'));
fs.copyFileSync(path.join(__dirname, 'mobile.js'), path.join(dst, 'js', 'mobile.js'));
console.log('web -> www copié');
