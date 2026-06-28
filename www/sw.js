/* sw.js — オフライン対応サービスワーカー
   アプリ本体（殻）をキャッシュし、ネットがなくても開けるようにする。
   データ本体は IndexedDB（端末内）にあり、ここでは扱わない。 */
const CACHE = 'cashbook-v4';
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

  // ページ遷移（ナビゲーション）はキャッシュ済みの index.html を返す。
  // リダイレクト付きレスポンスを返すと iOS のホーム画面アプリで
  // "Response served by service worker has redirections" になり開けなくなるため、
  // ここでリダイレクトを挟まないクリーンな 200 を返す。
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then((cached) => cached || fetch('./index.html'))
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // リダイレクトされたレスポンスはキャッシュしない（再生時に同エラーを防ぐ）
        if (res && res.ok && !res.redirected && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
