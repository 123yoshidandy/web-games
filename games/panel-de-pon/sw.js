// オフラインでも開けるようにする service worker
// 自分のファイルはネットワークを先に使い（更新がすぐ届く）、つながらないときだけキャッシュから返す。
// 文字（Google Fonts）は変わらないので、キャッシュを先に使う。
// オンライン対戦の WebSocket は fetch を通らないので、ここでは扱わない。
// キャッシュの名前は、ファイルを直すたびに変えなくてよい（ネットワークを先に使うので、新しい版はそのまま届く）
const CACHE = 'panel-de-pon-v1';
// 同じサイトにほかのゲームも並ぶので、消すのはこのゲームの古い版のキャッシュだけにする
const CACHE_PREFIX = CACHE.replace(/\d+$/, '');
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
// 画面・アイコン・JS・音。manifest のアイコンは icons/ を読むので、そちらも入れる。
// js/netplay/ は netplay-kit の写しだが、main.js が読み込むので、オフラインで開けるように入れる
const PRECACHE = [
    './', 'index.html', 'manifest.webmanifest', 'css/style.css',
    'favicon.svg', 'favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
    'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
    'js/constants.js', 'js/cpu-match.js', 'js/cpu.js', 'js/game.js', 'js/help.js', 'js/input.js',
    'js/layout.js', 'js/lobby.js', 'js/main.js', 'js/online-config.js', 'js/panel-art.js', 'js/random.js',
    'js/renderer.js', 'js/settings.js', 'js/sound.js', 'js/title.js',
    'js/netplay/netplay-client.mjs', 'js/netplay/netplay-client.js', 'js/netplay/user-stats.js',
    'sounds/swap.m4a', 'sounds/pop.m4a', 'sounds/chain.m4a', 'sounds/combo.m4a', 'sounds/land.m4a', 'sounds/gameover.m4a', 'sounds/bgm.m4a'
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
