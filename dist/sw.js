/* sw.js
 * けいさんモンスター — service worker(オフライン完結)
 *
 * 方針(SPEC §7):
 *  - オフラインで完全に動作させる。初回ロード以降はネットワークなしで起動できる。
 *  - 外部ドメインへは一切アクセスしない(子供向けのため通信ゼロ)。
 *    同一オリジンの GET のみを扱い、クロスオリジンのリクエストは素通しする。
 *  - ビルド成果物(ハッシュ付きファイル名)は取得時にキャッシュへ追加していく
 *    (cache-first + ランタイムキャッシュ)。
 */

const CACHE = 'km-cache-v1';

// 最低限プリキャッシュするアプリシェル(相対パス)
const CORE_ASSETS = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => {
        /* プリキャッシュ失敗時も SW のインストールは続行する */
      }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 外部オリジンには触れない(通信ゼロの担保)。同一オリジンのみ制御する。
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // 正常なレスポンスのみキャッシュへ複製して保存
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => {
          // オフラインかつ未キャッシュ: ナビゲーションなら index.html を返す
          if (req.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return Response.error();
        });
    }),
  );
});
