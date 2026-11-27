// オフラインでも開けるようにする service worker
// 自分のファイルはネットワークを先に使い（更新がすぐ届く）、つながらないときだけキャッシュから返す。
// キャッシュの名前は、直すたびに変えない（変えると、古い版が入れた分が消えて、かえってオフラインに弱くなる）
const CACHE = 'dune-imperium-v1';
// 同じサイトにほかのゲームも並ぶので、消すのはこのゲームの古い版のキャッシュだけにする
const CACHE_PREFIX = CACHE.replace(/\d+$/, '');
const PRECACHE = [
    './', 'index.html', 'manifest.webmanifest', 'favicon.svg', 'favicon.png', 'css/style.css',
    'js/main.js', 'js/ui.js', 'js/help.js', 'js/cards.js', 'js/game-controller.js', 'js/game.js',
    'js/game-view.js', 'js/cpu-player.js', 'js/random.js',
    'js/music.js', 'js/sound/engine.js', 'js/sound/engine.mjs', 'js/sound/effects.js', 'js/sound/bgm.js',
    'js/online-config.js', 'js/netplay/netplay-client.js', 'js/netplay/netplay-client.mjs', 'js/netplay/netplay-lobby.js'
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
    if (url.origin !== self.location.origin) return;
    event.respondWith(fetch(request).then(response => {
        if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
    }).catch(() => caches.match(request, { ignoreSearch: true })
        .then(hit => hit || (request.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
