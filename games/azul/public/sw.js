// オフラインでも開けるようにする service worker
// 中身は packages/pwa の js/sw-core.js（同期した写し）。ここには、このゲームのキャッシュの名前と、先に読むファイルの一覧だけを書く
// キャッシュの名前は、直すたびに変えない（変えると、前の版が入れた分が消えて、かえってオフラインに弱くなる）
const CACHE = 'azul-v1';
const PRECACHE = [
    './', 'index.html', 'manifest.webmanifest', 'favicon.svg', 'favicon.png', 'apple-touch-icon.png',
    'css/style.css', 'js/main.js', 'js/game.js', 'js/game-view.js', 'js/cpu-player.js',
    'js/game-controller.js', 'js/motion.js', 'js/random.js', 'js/storage.js',
    'js/music.js', 'js/sound/engine.js', 'js/sound/engine.mjs', 'js/sound/effects.js', 'js/sound/bgm.js',
    'js/online-config.js', 'js/netplay/netplay-client.js', 'js/netplay/netplay-client.mjs', 'js/netplay/netplay-lobby.js', 'js/netplay/user-stats.js',
    'js/pwa.js', 'js/pwa.mjs', 'js/sw-core.js'
];
importScripts('js/sw-core.js');
