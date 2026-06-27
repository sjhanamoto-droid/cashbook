/* sw.js — オフライン対応サービスワーカー
   アプリ本体（殻）をキャッシュし、ネットがなくても開けるようにする。
   データ本体は IndexedDB（端末内）にあり、ここでは扱わない。 */
const CACHE = 'cashbook-v3';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/db.js',
  './js/capacitor-plugins.js',
  './js/native.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // 同一オリジンの http(s) のみ対象。blob:/data:/chrome-extension: などは横取りしない
  // （領収書プレビューの blob: 画像が壊れるのを防ぐ）
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
