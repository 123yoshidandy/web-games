/**
 * 花見小路の起動
 */

import UI from './ui.js';
import * as Motion from './motion/motion.js';

// 画面を拡大させない（ふつうは style.css の touch-action で止まる。古い iOS は2本指の操作を止める）
// touchmove は止めない（passive でない touchmove があると、スクロールの始まりが遅れるため）
document.addEventListener('gesturestart', event => event.preventDefault());

// 動きの速さを、CSS（--motion-scale・data-motion）に伝え、タイトルの切り替えを作る
const paintMotion = () => {
    document.documentElement.style.setProperty('--motion-scale', Motion.speedScale());
    document.documentElement.dataset.motion = Motion.getSpeed();
};
paintMotion();
Motion.onSpeedChange(paintMotion);
Motion.mountSpeedSetting(document.getElementById('motion-setting'), { label: '' });

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
