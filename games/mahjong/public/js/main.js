/**
 * 麻雀の起動
 */

import UI from './ui.js';

// 画面を拡大させない（ふつうは style.css の touch-action で止まる。古い iOS は2本指の操作を止める）
// touchmove は止めない（passive でない touchmove があると、スクロールの始まりが遅れるため）
document.addEventListener('gesturestart', event => event.preventDefault());

const BASE_W = 667;
const BASE_H = 375;
const MAX_W = 900;

// 高さ 375px の舞台を画面に合わせて拡大・縮小する。横に余裕があれば、舞台の横幅を広げる（最大 900px）
// 縦持ちのスマホでは body が回っているので、body の縦横（回す前の大きさ）で測る
// ノッチなどを避ける余白（body の padding）は除く
function fit() {
    const style = getComputedStyle(document.body);
    const width = document.body.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const height = document.body.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const scale = Math.min(height / BASE_H, width / BASE_W);
    const stageW = Math.min(MAX_W, Math.max(BASE_W, width / scale));
    document.documentElement.style.setProperty('--scale', String(scale));
    document.documentElement.style.setProperty('--stage-w', `${stageW}px`);
}
fit();
window.addEventListener('resize', fit);
window.visualViewport?.addEventListener('resize', fit);

const ui = new UI();
ui.showTitle();
// 招待URL（?room=）か、前回入っていた部屋があれば、オンライン対戦に入る
ui.online.boot();
// 確かめるときに、ページの外から状態を見られるようにする
window.__app = ui;

// ホーム画面に置いて、オフラインでも開けるようにする（PWA）
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(registration => {
        const urls = [location.href, ...performance.getEntriesByType('resource').map(entry => entry.name)];
        registration.active?.postMessage({ type: 'cache-urls', urls });
    }).catch(() => {});
}
