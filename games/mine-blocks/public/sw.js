// オフラインでも開けるようにする service worker
// 中身は packages/pwa の js/sw-core.js（同期した写し）。ここには、このゲームのキャッシュの名前と、先に読むファイルの一覧だけを書く
// キャッシュの名前は、直すたびに変えない（変えると、前の版が入れた分が消えて、かえってオフラインに弱くなる）
const CACHE = 'mine-blocks-v1';
const PRECACHE = [
    './', 'index.html', 'css/style.css', 'manifest.webmanifest', 'favicon.svg', 'favicon.png',
    'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'js/block.js',
    'js/assist.js', 'js/board.js', 'js/challenge.js', 'js/effects.js', 'js/feedback.js', 'js/game-state.js', 'js/hint.js',
    'js/interaction.js', 'js/main.js', 'js/online-config.js', 'js/online.js', 'js/piece-shape.js',
    'js/random.js', 'js/resume.js', 'js/solution.js', 'js/music.js', 'js/surrender.js', 'js/top.js',
    'js/ui.js', 'js/stats.js', 'js/netplay/netplay-client.js', 'js/netplay/netplay-client.mjs',
    'js/netplay/user-stats.js', 'js/sound/engine.js', 'js/sound/engine.mjs', 'js/sound/effects.js', 'js/sound/bgm.js',
    'js/pwa.js', 'js/pwa.mjs', 'js/sw-core.js'
];
importScripts('js/sw-core.js');
