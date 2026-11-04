const CACHE = 'mycloset-shell-v8';
const ASSETS = ['./','./index.html','./batch.html','./batch.js','./batch.css','./manifest.webmanifest','./icon.svg','./apple-touch-icon.png','./icon-192.png','./icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('mycloset-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Never cache private API responses, authenticated requests, or media.
  if(event.request.method!=='GET'||url.origin!==location.origin||url.pathname.includes('/api/')||event.request.headers.has('Authorization'))return;
  const allowed = ASSETS.some(asset=>new URL(asset,self.registration.scope).pathname===url.pathname);
  if(!allowed)return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}
    return response;
  }).catch(()=>caches.match(event.request)));
});
