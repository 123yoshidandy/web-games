// オフラインでも開けるようにする service worker
// 自分のファイルはネットワークを先に使い（更新がすぐ届く）、つながらないときだけキャッシュから返す。
// キャッシュの名前は、直すたびに変えない（変えると、古い service worker が入れた分が消えて、かえってオフラインに弱くなる）
const CACHE = 'tents-v1';
// 同じサイトにほかのゲームも並ぶので、消すのはこのゲームの古い版のキャッシュだけにする
const CACHE_PREFIX = CACHE.replace(/\d+$/, '');
// 先に読むファイルの一覧は、npm run sw（packages/puzzle-kit/tools/precache.mjs）で作り直す。手で直さない
const PRECACHE = [
    './', 'index.html', 'manifest.webmanifest', 'favicon.svg', 'favicon.png', 'apple-touch-icon.png', 'css/style.css',
    'css/theme.css', 'js/cpu-player.js', 'js/game.js', 'js/help.js', 'js/main.js', 'js/music.js',
    'js/netplay/netplay-client.js', 'js/netplay/netplay-client.mjs', 'js/netplay/netplay-lobby.js',
    'js/netplay/user-stats.js', 'js/online-config.js', 'js/puzzle-set.js', 'js/puzzles/common/dom.js',
    'js/puzzles/registry.js', 'js/puzzles/tents/index.js', 'js/puzzles/tents/logic.js', 'js/puzzles/tents/render.js',
    'js/race-definition.js', 'js/race.js', 'js/random.js', 'js/result-hook.js', 'js/session.js', 'js/sound/bgm.js',
    'js/sound/effects.js', 'js/sound/engine.js', 'js/sound/engine.mjs', 'js/stats.js', 'js/storage.js'
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys()
        .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key))))
        .then(() => self.clients.claim()));
});

// 初めて開いたときは、この service worker が動く前に読み込みが終わっている。
// ページから読み込んだファイルの一覧を受け取り、キャッシュに入れておく。
self.addEventListener('message', event => {
    if (event.data?.type !== 'cache-urls') return;
    const urls = event.data.urls.filter(url => new URL(url).origin === self.location.origin);
    event.waitUntil(caches.open(CACHE).then(cache => Promise.all(urls.map(url => cache.match(url)
        .then(hit => hit || cache.add(url).catch(() => {}))))));
});

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (!url.protocol.startsWith('http') || url.origin !== self.location.origin) return;
    event.respondWith(fetch(request).then(response => {
        if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
    }).catch(() => caches.match(request, { ignoreSearch: true })
        .then(hit => hit || (request.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
