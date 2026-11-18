const C='minhaj-feebeabe';const A=["./","index.html","app.feebeabe.js","app.feebeabe.css","manifest.webmanifest","favicon.svg","icons/icon-192.png","icons/icon-512.png","icons/apple-touch-icon.png"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(A)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C&&x!=='minhaj-fonts').map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET')return;
 if(u.hostname.includes('fonts.g')){e.respondWith(caches.open('minhaj-fonts').then(c=>c.match(e.request).then(r=>r||fetch(e.request).then(n=>{c.put(e.request,n.clone());return n}))));return}
 if(u.origin!==location.origin)return;
 if(e.request.mode==='navigate'){e.respondWith(Promise.race([fetch(e.request,{cache:'no-store'}).then(n=>{if(n.ok){const c2=n.clone();caches.open(C).then(c=>c.put('index.html',c2))}return n}),new Promise((_,j)=>setTimeout(j,3500))]).catch(()=>caches.match('index.html')));return}
 e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});
