// Сборка: esbuild → dist/ (PWA) и dist-inline/index.html (один файл для предпросмотра).
import { createRequire } from 'node:module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { build } = require('esbuild');
const sharp = require('sharp');
import fs from 'node:fs';
import crypto from 'node:crypto';

const out = 'dist';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(`${out}/icons`, { recursive: true });

const res = await build({
  entryPoints: ['src/main.tsx'], bundle: true, minify: true, format: 'esm', target: ['safari15'],
  outdir: out, entryNames: 'app', write: false, jsx: 'automatic', legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"', __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')) }, nodePaths: ['/opt/npm-tools/node_modules'],
});
let js = '', css = '';
for (const f of res.outputFiles) { if (f.path.endsWith('.js')) js = f.text; if (f.path.endsWith('.css')) css = f.text; }
const ver = crypto.createHash('sha1').update(js + css).digest('hex').slice(0, 8);
fs.writeFileSync(`${out}/app.${ver}.js`, js);
fs.writeFileSync(`${out}/app.${ver}.css`, css);

// Иконка: восьмиконечная звезда на тёмно-зелёном
const iconSvg = (size, pad = 0) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#1F5C4A"/>
  <g transform="translate(50 50) scale(${(1 - pad) * 0.62}) translate(-50 -50)" fill="none" stroke="#E7CF94" stroke-width="3.2" stroke-linejoin="round">
    <rect x="20" y="20" width="60" height="60"/><rect x="20" y="20" width="60" height="60" transform="rotate(45 50 50)"/>
    <circle cx="50" cy="50" r="14" fill="#E7CF94" stroke="none"/>
  </g></svg>`;
for (const [name, size, pad] of [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['maskable-512.png', 512, 0.25], ['apple-touch-icon.png', 180, 0]]) {
  await sharp(Buffer.from(iconSvg(size, pad))).png().toFile(`${out}/icons/${name}`);
}
fs.writeFileSync(`${out}/favicon.svg`, iconSvg(64));

fs.writeFileSync(`${out}/manifest.webmanifest`, JSON.stringify({
  name: 'Минхадж — учебный план', short_name: 'Минхадж', lang: 'ru', start_url: './', scope: './', display: 'standalone',
  orientation: 'any', background_color: '#F4F1E8', theme_color: '#F4F1E8',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 1));

const head = (inlineCss, scriptTag) => `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#F4F1E8">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Минхадж">
<title>Минхадж</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap" rel="stylesheet">
${inlineCss}
<script>
  // тестовый «сейчас»: ?now=2026-11-17T15:42:00%2B03:00
  (function(){var m=location.search.match(/[?&]now=([^&]+)/);if(m){var t=Date.parse(decodeURIComponent(m[1]));if(!isNaN(t)){var d=t-Date.now();window.__MINHAJ_NOW_OFFSET=d;Object.defineProperty(window,'__MINHAJ_NOW',{get:function(){return Date.now()+d}});}}})();
</script>
</head>
<body>
<div id="root"></div>
${scriptTag}
</body>
</html>`;

fs.writeFileSync(`${out}/index.html`, head(`<link rel="stylesheet" href="app.${ver}.css">`, `<script type="module" src="app.${ver}.js"></script>`));

// Service worker: всё приложение в кэше → работает без интернета.
const assets = ['./', 'index.html', `app.${ver}.js`, `app.${ver}.css`, 'manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
fs.writeFileSync(`${out}/sw.js`, `const C='minhaj-${ver}';const A=${JSON.stringify(assets)};
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(A)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C&&x!=='minhaj-fonts').map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET')return;
 if(u.hostname.includes('fonts.g')){e.respondWith(caches.open('minhaj-fonts').then(c=>c.match(e.request).then(r=>r||fetch(e.request).then(n=>{c.put(e.request,n.clone());return n}))));return}
 if(u.origin!==location.origin)return;
 if(e.request.mode==='navigate'){e.respondWith(Promise.race([fetch(e.request,{cache:'no-store'}).then(n=>{if(n.ok){const c2=n.clone();caches.open(C).then(c=>c.put('index.html',c2))}return n}),new Promise((_,j)=>setTimeout(j,3500))]).catch(()=>caches.match('index.html')));return}
 e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});
`);

// Один файл для предпросмотра (артефакт): всё встроено, иконки — data URL.
const ico = 'data:image/png;base64,' + fs.readFileSync(`${out}/icons/apple-touch-icon.png`).toString('base64');
fs.mkdirSync('dist-inline', { recursive: true });
let inline = head(`<style>${css}</style>`, `<script type="module">${js.replace(/<\/script/g, '<\\/script')}</script>`)
  .replace('<link rel="manifest" href="manifest.webmanifest">\n', '')
  .replace('href="favicon.svg"', `href="${ico}"`).replace('href="icons/apple-touch-icon.png"', `href="${ico}"`);
fs.writeFileSync('dist-inline/index.html', inline);
console.log('built', ver, (js.length / 1024).toFixed(0) + 'KB js', (css.length / 1024).toFixed(0) + 'KB css');
