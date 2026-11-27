// オフラインでも開けるようにする service worker
// 自分のファイルはネットワークを先に使い（更新がすぐ届く）、つながらないときだけキャッシュから返す。
// 文字（Google Fonts）は変わらないので、キャッシュを先に使う。
// キャッシュの名前は、直すたびに変えない（ネットワークを先に使うので、新しい版はそのまま届く）
const CACHE = 'pcg-v1';
// 同じサイトにほかのゲームも並ぶので、消すのはこのゲームの古い版のキャッシュだけにする
const CACHE_PREFIX = CACHE.replace(/\d+$/, '');
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
// 初めて開いたあとすぐオフラインになっても遊べるよう、画面に要るファイルはすべて先読みする。
// js/netplay/ は netplay-kit の写しだが、オンライン対戦の画面が読むので入れる
const PRECACHE = [
    './', 'index.html', 'manifest.webmanifest', 'css/style.css',
    'favicon.svg', 'favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
    'js/card-data.js', 'js/card-filter.js', 'js/cpu-player.js', 'js/deck-builder.js', 'js/deck-rules.js',
    'js/deck-store.js', 'js/decks.js', 'js/game-controller.js', 'js/game-view.js', 'js/game.js', 'js/main.js',
    'js/music.js', 'js/online-controller.js', 'js/random.js', 'js/regulation.js', 'js/shared-decks.js', 'js/sound.js',
    'js/cards/ability-effects.js', 'js/cards/attack-effects.js', 'js/cards/attack-overrides.js',
    'js/cards/attack-overrides-a.js', 'js/cards/attack-overrides-b.js', 'js/cards/catalog.js',
    'js/cards/energy-effects.js', 'js/cards/text.js', 'js/cards/trainer-effects.js',
    'js/cards/abilities/abilities-a.js', 'js/cards/abilities/abilities-b.js', 'js/cards/abilities/abilities-c.js',
    'js/cards/abilities/abilities-more.js', 'js/cards/abilities/abilities-tags.js',
    'js/cards/trainers/extras.js', 'js/cards/trainers/fossils.js', 'js/cards/trainers/items.js',
    'js/cards/trainers/stadiums.js', 'js/cards/trainers/supporters.js', 'js/cards/trainers/tools.js',
    'js/ui/animator.js', 'js/ui/best-decks.js', 'js/ui/card-view.js', 'js/ui/deck-screen.js', 'js/ui/game-screen.js',
    'js/ui/motifs.js', 'js/ui/press.js', 'js/ui/sheets.js', 'js/ui/trainer-motifs.js',
    'js/sound/engine.js', 'js/sound/engine.mjs', 'js/sound/effects.js', 'js/sound/bgm.js',
    'js/netplay/netplay-client.mjs', 'js/netplay/netplay-client.js', 'js/netplay/user-stats.js',
    // 最強のデッキ（scripts/deck-search.mjs が GitHub Actions で更新する）
    'data/best-decks.json'
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
