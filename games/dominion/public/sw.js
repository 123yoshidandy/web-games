// オフラインでも開けるようにする service worker
// 自分のファイルはネットワークを先に使い（更新がすぐ届く）、つながらないときだけキャッシュから返す。
// 文字（Google Fonts）は変わらないので、キャッシュを先に使う。
// オンライン対戦の WebSocket は fetch を通らないので、ここでは扱わない。
// キャッシュの名前は、ファイルを直すたびに変えなくてよい（ネットワークを先に使うので、新しい版はそのまま届く）
const CACHE = 'dominion-v1';
// 同じサイトにほかのゲームも並ぶので、消すのはこのゲームの古い版のキャッシュだけにする
const CACHE_PREFIX = CACHE.replace(/\d+$/, '');
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const PRECACHE = [
    './', 'index.html', 'manifest.webmanifest', 'css/styles.css', 'favicon.svg', 'favicon.png', 'apple-touch-icon.png',
    'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'js/card-animations.js', 'js/card-art-adventures.js',
    'js/card-art-alchemy.js', 'js/card-art-allies.js', 'js/card-art-cornucopia-guilds.js', 'js/card-art-dark-ages.js',
    'js/card-art-empires.js', 'js/card-art-helpers.js', 'js/card-art-hinterlands.js', 'js/card-art-intrigue.js',
    'js/card-art-menagerie.js', 'js/card-art-nocturne.js', 'js/card-art-plunder.js', 'js/card-art-prosperity.js',
    'js/card-art-renaissance.js', 'js/card-art-rising-sun.js', 'js/card-art.js', 'js/card-data-adventures.js',
    'js/card-data-alchemy.js', 'js/card-data-allies.js', 'js/card-data-cornucopia-guilds.js',
    'js/card-data-dark-ages.js', 'js/card-data-empires.js', 'js/card-data-hinterlands.js', 'js/card-data-intrigue.js',
    'js/card-data-menagerie.js', 'js/card-data-nocturne.js', 'js/card-data-plunder.js', 'js/card-data-prosperity.js',
    'js/card-data-renaissance.js', 'js/card-data-rising-sun.js', 'js/card-data-seaside.js', 'js/card-data.js',
    'js/card-helpers.js', 'js/card-types.js', 'js/card.js', 'js/cpu-player.js', 'js/game-allies.js',
    'js/game-controller.js', 'js/game-landscapes.js', 'js/game-menagerie.js', 'js/game-nocturne.js',
    'js/game-plunder.js', 'js/game-realtime.js', 'js/game-rising-sun.js', 'js/game-view.js', 'js/game.js',
    'js/main.js', 'js/music.js', 'js/netplay/netplay-client.js', 'js/netplay/netplay-client.mjs',
    'js/online-config.js', 'js/online-controller.js', 'js/player.js', 'js/press-handler.js', 'js/random.js',
    'js/sound/bgm.js', 'js/sound/engine.js', 'js/sound/engine.mjs', 'js/sound/effects.js', 'js/ui-controller.js', 'js/ui-event-handler.js',
    'js/ui-modal.js', 'js/ui-view.js'
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
// ページから読み込んだファイル（自分のファイルと Google Fonts）の一覧を受け取り、キャッシュに入れておく。
self.addEventListener('message', event => {
    if (event.data?.type !== 'cache-urls') return;
    const urls = event.data.urls.filter(url => {
        const { origin, hostname } = new URL(url);
        return origin === self.location.origin || FONT_HOSTS.includes(hostname);
    });
    event.waitUntil(caches.open(CACHE).then(cache => Promise.all(urls.map(url => cache.match(url)
        .then(hit => hit || cache.add(url).catch(() => {}))))));
});

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (!url.protocol.startsWith('http')) return;
    if (FONT_HOSTS.includes(url.hostname)) {
        event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(response => {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy));
            return response;
        })));
        return;
    }
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
