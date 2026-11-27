/**
 * バーグルブロスの起動
 */

import UI from './ui.js';
import { preventZoom, registerServiceWorker } from './pwa.mjs';

// 画面を拡大させない（ふつうは style.css の touch-action で止まる。古い iOS は2本指の操作を止める）
preventZoom();

const ui = new UI();
ui.showTitle();
// 確かめるときに、ページの外から状態を見られるようにする
window.__app = ui;
ui.online.boot(); // 招待の URL（?room=）から入る、または前の部屋に戻る

// ホーム画面に置いて、オフラインでも開けるようにする（PWA）
registerServiceWorker();
